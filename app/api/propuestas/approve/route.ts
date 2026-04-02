import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { organizacionParaAprobarPropuesta } from "@/lib/matriz-gerencia-jefatura";

const BodySchema = z.object({
  propuesta_id: z.string().uuid()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
    const rol = String((me as { rol?: string } | null)?.rol ?? "user");
    if (rol !== "admin" && rol !== "super_admin") {
      return NextResponse.json({ error: "Solo admin / super admin puede aprobar propuestas" }, { status: 403 });
    }

    const body = BodySchema.parse(await req.json());

    const { data: propuesta, error: pErr } = await supabase
      .from("propuestas_pendientes")
      .select("*")
      .eq("id", body.propuesta_id)
      .single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

    if ((propuesta as { aplica_usuario?: boolean | null }).aplica_usuario === false) {
      return NextResponse.json(
        { error: "Marcado como «No aplica». Ajusta el triage o elimina la propuesta antes de aprobar." },
        { status: 400 }
      );
    }

    const gUser = (propuesta as { asignacion_gerencia?: string | null }).asignacion_gerencia?.trim();
    const jUser = (propuesta as { asignacion_jefatura?: string | null }).asignacion_jefatura?.trim();
    const supId = (propuesta as { supervisor_legal_id?: string | null }).supervisor_legal_id ?? null;
    const normativaDocId = (propuesta as { normativa_doc_id?: string | null }).normativa_doc_id ?? null;
    const extraCols = propuesta as any;

    const org = organizacionParaAprobarPropuesta({
      asignacion_gerencia: gUser || null,
      asignacion_jefatura: jUser || null,
      gerencia_competente: propuesta.gerencia_competente,
      area_competente: propuesta.area_competente,
      sponsor: extraCols.sponsor,
      responsable_proceso: extraCols.responsable_proceso
    });

    // Insert into matriz_cumplimiento
    const insertPayload = {
      negocio_id: propuesta.negocio_id,
      tipo_norma: extraCols.tipo_norma ?? null,
      norma_nombre: extraCols.norma_nombre ?? null,
      fecha_publicacion: extraCols.fecha_publicacion ?? null,
      organismo_emisor: extraCols.organismo_emisor ?? null,
      resumen_experto: extraCols.resumen_experto ?? null,
      campo_juridico: extraCols.campo_juridico ?? null,
      observaciones: extraCols.observaciones ?? null,
      proceso_actividad_relacionada: extraCols.proceso_actividad_relacionada ?? null,
      sponsor: org.sponsor,
      responsable_proceso: org.responsable_proceso,
      articulo: propuesta.articulo,
      requisito: propuesta.requisito,
      sancion: propuesta.sancion,
      multa_estimada_usd: propuesta.multa_estimada_usd,
      impacto_economico: propuesta.impacto_economico,
      probabilidad_incumplimiento: propuesta.probabilidad_incumplimiento,
      prioridad: propuesta.prioridad,
      estado: propuesta.estado,
      evidencia_url: propuesta.evidencia_url,
      cita_textual: propuesta.cita_textual,
      link_fuente_oficial: propuesta.link_fuente_oficial,
      fuente_verificada_url: propuesta.fuente_verificada_url,
      gerencia_competente: org.gerencia_competente,
      area_competente: org.area_competente,
      supervisor_legal_id: supId,
      normativa_doc_id: normativaDocId,
      created_by: userData.user.id
    };

    const { data: inserted, error: iErr } = await supabase
      .from("matriz_cumplimiento")
      .insert(insertPayload)
      .select("id")
      .single();
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });

    // Audit log
    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "APROBAR_PROPUESTA",
      tabla: "propuestas_pendientes",
      registro_id: propuesta.id,
      valor_anterior: propuesta,
      valor_nuevo: { matriz_id: inserted?.id }
    });

    // Delete proposal
    const { error: dErr } = await supabase.from("propuestas_pendientes").delete().eq("id", propuesta.id);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, matriz_id: inserted?.id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

