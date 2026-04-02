import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapNegocioNormativaGemini } from "@/lib/gemini-normativa";
import { propagateObligacionResumenConsolidado } from "@/lib/obligacion-grupo";
import { normalizeOrganizacion4 } from "@/lib/matriz-gerencia-jefatura";
import { itemDebeDescartarsePorHeuristica } from "@/lib/extract-applicability-heuristic";
import { coerceImpactoEconomico, coerceProbabilidadIncumplimiento } from "@/lib/coerce-impacto-probabilidad";
import { estimateUsdFromSanction, classifyPrioridad, computePriorityScore } from "@/lib/finance";
import type { GeminiExtractionItem } from "@/app/api/gemini/extract/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  normativa_doc_ids: z.array(z.string().uuid()).min(1)
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const { data: biz, error: bErr } = await supabase
      .from("negocios")
      .select(
        "id,nombre,sector,detalles_negocio,regulacion_actividades_especiales,normativa_actualizar_nota,normativa_actualizar_urls"
      )
      .eq("id", body.negocio_id)
      .single();
    if (bErr || !biz) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 400 });

    const { data: docs, error: dErr } = await supabase
      .from("normativa_docs")
      .select("id,titulo,texto_extraido,negocio_id")
      .in("id", body.normativa_doc_ids);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });
    if (!docs?.length) return NextResponse.json({ error: "No hay documentos seleccionados" }, { status: 400 });

    const docsConTexto = (docs ?? []).filter((d) => (d.texto_extraido ?? "").trim().length >= 200);
    const docsSinTexto = (docs ?? []).filter((d) => !docsConTexto.some((x) => x.id === d.id));
    if (docsConTexto.length === 0) {
      return NextResponse.json(
        {
          error:
            "Los PDFs seleccionados no tienen texto extraído (posible PDF escaneado o extracción fallida). Sube un PDF con texto seleccionable o revisa la extracción.",
          code: "NO_TEXT_EXTRACTED"
        },
        { status: 422 }
      );
    }

    const { docs: aplicacionIA, items: itemsRaw } = await mapNegocioNormativaGemini({
      negocio: {
        nombre: biz.nombre,
        sector: biz.sector,
        detalles: biz.detalles_negocio,
        regulacion: biz.regulacion_actividades_especiales,
        nota: biz.normativa_actualizar_nota,
        urls: biz.normativa_actualizar_urls
      },
      documentos: docsConTexto.map((d) => ({
        id: d.id,
        titulo: d.titulo,
        texto: d.texto_extraido ?? ""
      }))
    });

    const contexto_rubro =
      [
        (biz as { regulacion_actividades_especiales?: string | null }).regulacion_actividades_especiales
          ? `Actividades reguladas: ${(biz as { regulacion_actividades_especiales?: string }).regulacion_actividades_especiales}`
          : "",
        (biz as { normativa_actualizar_nota?: string | null }).normativa_actualizar_nota
          ? `Normativa a actualizar (nota): ${(biz as { normativa_actualizar_nota?: string }).normativa_actualizar_nota}`
          : "",
        (biz as { normativa_actualizar_urls?: string | null }).normativa_actualizar_urls
          ? `Enlaces de referencia (usuario): ${(biz as { normativa_actualizar_urls?: string }).normativa_actualizar_urls}`
          : ""
      ]
        .filter(Boolean)
        .join("\n") || null;

    const perfilNegocioMap = {
      nombre: biz.nombre,
      sector: biz.sector,
      detalles: biz.detalles_negocio,
      contexto_rubro: contexto_rubro
    };
    const tienePerfilNegocio = Boolean(
      perfilNegocioMap.nombre?.trim() ||
        perfilNegocioMap.sector?.trim() ||
        perfilNegocioMap.detalles?.trim() ||
        perfilNegocioMap.contexto_rubro?.trim()
    );

    let items = [...itemsRaw];
    const omitidosHeuristica = tienePerfilNegocio
      ? items.filter((it) => itemDebeDescartarsePorHeuristica(it, perfilNegocioMap)).length
      : 0;
    if (tienePerfilNegocio) {
      items = items.filter((it) => !itemDebeDescartarsePorHeuristica(it, perfilNegocioMap));
    }
    propagateObligacionResumenConsolidado(items);
    items = items.map((it) => ({ ...it, ...normalizeOrganizacion4(it) }));

    const aplicacion = [
      ...aplicacionIA,
      ...docsSinTexto.map((d) => ({ doc_id: d.id, aplica: false, motivo: "Sin texto extraído para analizar." }))
    ];

    const aplicanIds = new Set(aplicacion.filter((a) => a.aplica).map((a) => a.doc_id));
    const primeraAplica = [...aplicanIds][0] ?? null;

    const toRow = (it: GeminiExtractionItem) => {
      const impacto = coerceImpactoEconomico((it as { impacto_economico?: unknown }).impacto_economico);
      const prob = coerceProbabilidadIncumplimiento((it as { probabilidad_incumplimiento?: unknown }).probabilidad_incumplimiento);
      const multa = estimateUsdFromSanction(it.sancion);
      const score = computePriorityScore(impacto, prob);
      const prioridad = classifyPrioridad({ sancion: it.sancion, multa_estimada_usd: multa, priorityScore: score });
      const org = normalizeOrganizacion4(it);
      return {
        negocio_id: body.negocio_id,
        tipo_norma: (it as any).tipo_norma ?? null,
        norma_nombre: (it as any).norma_nombre ?? null,
        fecha_publicacion: (it as any).fecha_publicacion ?? null,
        organismo_emisor: (it as any).organismo_emisor ?? null,
        resumen_experto: (it as any).resumen_experto ?? null,
        campo_juridico: (it as any).campo_juridico ?? null,
        observaciones: (it as any).observaciones ?? null,
        proceso_actividad_relacionada: (it as any).proceso_actividad_relacionada ?? null,
        sponsor: org.sponsor,
        responsable_proceso: org.responsable_proceso,
        articulo: it.articulo || "—",
        requisito: it.requisito,
        sancion: it.sancion,
        cita_textual: it.cita_textual,
        link_fuente_oficial: it.link_fuente_oficial,
        fuente_verificada_url: it.fuente_verificada_url,
        gerencia_competente: org.gerencia_competente,
        area_competente: org.area_competente,
        multa_estimada_usd: multa,
        impacto_economico: impacto,
        probabilidad_incumplimiento: prob,
        prioridad,
        estado: "pendiente" as const,
        normativa_doc_id: primeraAplica,
        extra: {
          origen: "mapa_normativa",
          doc_ids: body.normativa_doc_ids,
          aplicacion,
          generado_at: new Date().toISOString(),
          obligacion_grupo_id: (it as { obligacion_grupo_id?: string | null }).obligacion_grupo_id ?? null,
          obligacion_grupo_etiqueta: (it as { obligacion_grupo_etiqueta?: string | null }).obligacion_grupo_etiqueta ?? null,
          obligacion_resumen_consolidado:
            (it as { obligacion_resumen_consolidado?: string | null }).obligacion_resumen_consolidado ?? null
        }
      };
    };

    const payload = items.map(toRow);
    if (payload.length > 0) {
      const { error: insErr } = await supabase.from("propuestas_pendientes").insert(payload);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "MAPA_NORMATIVA_IA",
      tabla: "propuestas_pendientes",
      registro_id: null,
      valor_nuevo: {
        negocio_id: body.negocio_id,
        docs: body.normativa_doc_ids,
        aplicacion,
        filas_sugeridas: payload.length,
        docs_sin_texto: docsSinTexto.map((d) => d.id)
      }
    });

    const warningParts: string[] = [];
    if (docsSinTexto.length > 0) {
      warningParts.push(`Nota: ${docsSinTexto.length} PDF(s) no tenían texto extraído y se marcaron como "No aplica".`);
    }
    if (omitidosHeuristica > 0) {
      warningParts.push(
        `${omitidosHeuristica} sugerencia(s) omitida(s): competencia propia de Estado/penitenciario o sistema financiero supervisado, no alineadas al perfil del negocio.`
      );
    }
    const warning = warningParts.length > 0 ? warningParts.join(" ") : null;
    return NextResponse.json({ ok: true, aplicacion, items_generados: payload.length, warning });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg.startsWith("GEMINI_QUOTA:")) {
      const retry = msg.match(/(\d+)\s*s/i)?.[1];
      return NextResponse.json(
        {
          error: msg.replace(/^GEMINI_QUOTA:\s*/i, ""),
          code: "GEMINI_QUOTA",
          retry_after_seconds: retry ? Number(retry) : 60
        },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
