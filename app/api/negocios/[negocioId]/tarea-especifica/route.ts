import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GeminiExtractionItem } from "@/app/api/gemini/extract/route";
import { generateAiText } from "@/lib/ai";
import { classifyPrioridad, computePriorityScore, estimateUsdFromSanction } from "@/lib/finance";

type RouteCtx = { params: Promise<{ negocioId: string }> };

const BodySchema = z.object({
  descripcion: z.string().min(10),
  actividad_id: z.string().uuid().optional()
});

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const { negocioId } = await ctx.params;
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const { data: negocio, error: nErr } = await supabase
      .from("negocios")
      .select("id,nombre,sector,detalles_negocio,regulacion_actividades_especiales")
      .eq("id", negocioId)
      .single();
    if (nErr || !negocio) return NextResponse.json({ error: "Negocio no encontrado o sin acceso" }, { status: 404 });

    const { data: docs, error: dErr } = await supabase
      .from("normativa_docs")
      .select("id,titulo,texto_extraido")
      .eq("negocio_id", negocioId)
      .not("texto_extraido", "is", null)
      .order("created_at", { ascending: false })
      .limit(6);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    const context =
      (docs ?? [])
        .map((d, i) => {
          return [
            `### DOC ${i + 1} id=${d.id} titulo=${d.titulo ?? "—"}`,
            String(d.texto_extraido ?? "").slice(0, 20_000)
          ].join("\n");
        })
        .join("\n\n") || "Sin normativa cargada para este negocio.";

    const prompt = [
      "Eres analista de cumplimiento en Ecuador (2026).",
      "El usuario describe una TAREA ESPECÍFICA de este negocio que no quedó cubierta por la descripción general.",
      "Usa EXCLUSIVAMENTE la normativa incluida en el CONTEXTO para proponer requisitos para la matriz de cumplimiento.",
      "",
      "Devuelve SOLO JSON con la forma:",
      "{ items: [ { tipo_norma, norma_nombre, fecha_publicacion, organismo_emisor, resumen_experto, campo_juridico, observaciones, proceso_actividad_relacionada, sponsor, responsable_proceso, articulo, requisito, sancion, cita_textual, link_fuente_oficial, fuente_verificada_url, area_competente, gerencia_competente, impacto_economico, probabilidad_incumplimiento } ] }",
      "",
      "Reglas:",
      "- Si no hay base normativa suficiente para responder, devuelve items: [].",
      "- 'requisito' debe ser accionable y comprobable con evidencia.",
      "- No inventes normas ajenas al contexto; si algo parece hipótesis, deja claro en 'observaciones'.",
      "",
      `NEGOCIO nombre=${negocio.nombre} sector=${negocio.sector ?? "—"}`,
      `descripcion_general=${negocio.detalles_negocio ?? "—"}`,
      `regulacion_especial=${negocio.regulacion_actividades_especiales ?? "—"}`,
      "",
      `TAREA_ESPECIFICA: ${body.descripcion}`,
      "",
      "CONTEXTO_NORMATIVO:",
      context
    ].join("\n");

    let text = "";
    try {
      text = await generateAiText(prompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: "IA sin JSON", raw: text }, { status: 502 });
    const parsed = JSON.parse(m[0]) as { items?: GeminiExtractionItem[] };
    const items = Array.isArray(parsed.items) ? (parsed.items as GeminiExtractionItem[]) : [];

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        items_generados: 0
      });
    }

    const payload = items.map((it) => {
      const multa = estimateUsdFromSanction(it.sancion);
      const score = computePriorityScore(it.impacto_economico, it.probabilidad_incumplimiento);
      const prioridad = classifyPrioridad({ sancion: it.sancion, multa_estimada_usd: multa, priorityScore: score });
      return {
        negocio_id: negocioId,
        articulo: it.articulo || "—",
        requisito: it.requisito,
        sancion: it.sancion,
        cita_textual: it.cita_textual,
        link_fuente_oficial: it.link_fuente_oficial,
        fuente_verificada_url: it.fuente_verificada_url,
        tipo_norma: it.tipo_norma ?? null,
        norma_nombre: it.norma_nombre ?? null,
        fecha_publicacion: it.fecha_publicacion ?? null,
        organismo_emisor: it.organismo_emisor ?? null,
        resumen_experto: it.resumen_experto ?? null,
        campo_juridico: it.campo_juridico ?? null,
        observaciones: it.observaciones ?? null,
        proceso_actividad_relacionada: it.proceso_actividad_relacionada ?? null,
        sponsor: it.sponsor ?? null,
        responsable_proceso: it.responsable_proceso ?? null,
        gerencia_competente: it.gerencia_competente ?? null,
        area_competente: it.area_competente ?? null,
        multa_estimada_usd: multa,
        impacto_economico: it.impacto_economico,
        probabilidad_incumplimiento: it.probabilidad_incumplimiento,
        prioridad,
        actividad_id: body.actividad_id ?? null,
        estado: "pendiente" as const,
        extra: {
          origen: "tarea_especifica",
          descripcion_tarea: body.descripcion,
          generado_por: userData.user.id
        }
      };
    });

    const { error: insErr } = await supabase.from("propuestas_pendientes").insert(payload);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      items_generados: payload.length
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

