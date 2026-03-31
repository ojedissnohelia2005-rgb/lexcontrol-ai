import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperAdminSession } from "@/lib/auth-server";
import { classifyPrioridad, computePriorityScore, estimateUsdFromSanction } from "@/lib/finance";

const BodySchema = z.object({
  reporte_id: z.string().uuid()
});

type Riesgo = {
  articulo?: string;
  requisito: string;
  sancion?: string | null;
  recomendacion?: string | null;
  impacto_economico?: number | null;
  probabilidad_incumplimiento?: number | null;
  cita_textual?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const okAdmin = await isSuperAdminSession(supabase, userData.user.id, userData.user.email);
    if (!okAdmin) return NextResponse.json({ error: "Solo Super Admin puede aplicar a la matriz" }, { status: 403 });

    const body = BodySchema.parse(await req.json());

    const { data: rep, error: rErr } = await supabase
      .from("auditoria_externa_reportes")
      .select("id,negocio_id,riesgos_json,titulo")
      .eq("id", body.reporte_id)
      .single();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });

    const riesgos = (rep.riesgos_json ?? []) as Riesgo[];
    if (!Array.isArray(riesgos) || riesgos.length === 0) {
      return NextResponse.json({ error: "El informe no tiene riesgos parseados" }, { status: 400 });
    }

    const payload = riesgos.map((r) => {
      const reqText = r.recomendacion
        ? `${r.requisito}\n\nRecomendación auditoría: ${r.recomendacion}`
        : r.requisito;
      const multa = estimateUsdFromSanction(r.sancion ?? null);
      const score = computePriorityScore(r.impacto_economico ?? null, r.probabilidad_incumplimiento ?? null);
      const prioridad = classifyPrioridad({
        sancion: r.sancion ?? null,
        multa_estimada_usd: multa,
        priorityScore: score
      });
      return {
        negocio_id: rep.negocio_id,
        articulo: r.articulo && r.articulo.length > 0 ? r.articulo : "Auditoría externa",
        requisito: reqText,
        sancion: r.sancion ?? null,
        multa_estimada_usd: multa,
        impacto_economico: r.impacto_economico ?? null,
        probabilidad_incumplimiento: r.probabilidad_incumplimiento ?? null,
        prioridad,
        estado: "pendiente" as const,
        cita_textual: r.cita_textual ?? null,
        fuente_verificada_url: null,
        extra: { origen: "auditoria_externa", reporte_id: rep.id, titulo_informe: rep.titulo }
      };
    });

    const { error: pErr } = await supabase.from("propuestas_pendientes").insert(payload);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "AUDITORIA_EXTERNA_APLICAR_MATRIZ",
      tabla: "auditoria_externa_reportes",
      registro_id: rep.id,
      valor_nuevo: { propuestas_creadas: payload.length }
    });

    return NextResponse.json({ ok: true, propuestas_creadas: payload.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
