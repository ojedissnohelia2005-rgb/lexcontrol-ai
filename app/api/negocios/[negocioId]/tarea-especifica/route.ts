import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GeminiExtractionItem } from "@/app/api/gemini/extract/route";
import { generateAiText } from "@/lib/ai";
import { classifyPrioridad, computePriorityScore, estimateUsdFromSanction } from "@/lib/finance";
import { normalizeOrganizacion4 } from "@/lib/matriz-gerencia-jefatura";

type RouteCtx = { params: Promise<{ negocioId: string }> };

const BodySchema = z.object({
  descripcion: z.string().min(10),
  actividad_id: z.string().uuid().optional()
});

const MAX_DOCS = 10;
const CHARS_PER_DOC = 14_000;

const AVISO_SIN_BIBLIOTECA =
  "No respaldado por PDF en la biblioteca del sistema (propuesta por conocimiento general de la IA). Verificar siempre en norma oficial / Registro Oficial antes de aplicar.";

type ItemTarea = GeminiExtractionItem & { respaldado_en_biblioteca?: boolean };

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

    let actividadNombre: string | null = null;
    if (body.actividad_id) {
      const { data: act } = await supabase
        .from("negocio_actividades")
        .select("nombre")
        .eq("id", body.actividad_id)
        .eq("negocio_id", negocioId)
        .maybeSingle();
      actividadNombre = (act as { nombre?: string } | null)?.nombre ?? null;
    }

    const { data: docs, error: dErr } = await supabase
      .from("normativa_docs")
      .select("id,titulo,texto_extraido,negocio_id")
      .not("texto_extraido", "is", null)
      .or(`negocio_id.is.null,negocio_id.eq.${negocioId}`)
      .order("created_at", { ascending: false })
      .limit(MAX_DOCS);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    const hayDocs = (docs ?? []).length > 0;

    const context = hayDocs
      ? (docs ?? [])
          .map((d, i) => {
            return [
              `### DOC ${i + 1} id=${d.id} titulo=${d.titulo ?? "—"}`,
              String(d.texto_extraido ?? "").slice(0, CHARS_PER_DOC)
            ].join("\n");
          })
          .join("\n\n")
      : "(La biblioteca del sistema no tiene PDFs indexados todavía para este negocio/global; debes proponer igualmente según conocimiento jurídico y advertir falta de respaldo.)";

    const prompt = [
      "Eres analista senior de cumplimiento normativo en Ecuador (2026).",
      "",
      "El usuario describe una TAREA ESPECÍFICA del negocio. Primero infiere el **ámbito jurídico principal** (laboral, tributario, ambiental, datos personales, sectorial, etc.) a partir de la tarea, la actividad vinculada y el sector del negocio.",
      "",
      "Cadena de trabajo:",
      "1) **Buscar en CONTEXTO_NORMATIVO** (PDFs ya cargados): si hay texto aplicable, construye requisitos anclados a ese texto (cita_textual breve, idealmente doc id en observaciones: «Respaldo: DOC n id=…»).",
      "2) **Si no hay fragmento aplicable en el contexto** (o el tema no aparece en los PDFs), **igual propone** requisitos razonables usando tu conocimiento de normativa ecuatoriana vigente (ej. Código del Trabajo y reglamentos para obligaciones laborales).",
      "3) Cuando el ítem **no** esté sustentado por un extracto del CONTEXTO, debes marcarlo claramente para el usuario (ver `respaldado_en_biblioteca` abajo).",
      "",
      "Devuelve un JSON ÚNICO con forma:",
      "{ items: [ { respaldado_en_biblioteca, tipo_norma, norma_nombre, fecha_publicacion, organismo_emisor, resumen_experto, campo_juridico, observaciones, proceso_actividad_relacionada, sponsor, responsable_proceso, articulo, requisito, sancion, cita_textual, link_fuente_oficial, fuente_verificada_url, area_competente, gerencia_competente, impacto_economico, probabilidad_incumplimiento } ] }",
      "",
      "Clave obligatoria por ítem:",
      "- **respaldado_en_biblioteca** (boolean): `true` solo si el requisito se apoya en un pasaje concreto del CONTEXTO_NORMATIVO. `false` si depende de conocimiento general porque no hay texto aplicable en los PDFs o el fragmento es insuficiente.",
      "",
      "Reglas:",
      "- Si la tarea es coherente y hay marco legal aplicable, genera **al menos 3** ítems (ideal 4–8), mezclando si aplica: algunos con respaldo en PDF y otros solo conocimiento general con `respaldado_en_biblioteca: false`.",
      "- Con `respaldado_en_biblioteca: false`: en **observaciones** explica que **no está respaldado por la biblioteca** y que debe **verificarse en fuente oficial** (Registro Oficial, .gob.ec, etc.).",
      "- Con `respaldado_en_biblioteca: true`: cita_textual debe ser del contexto; en observaciones indica el id del documento (DOC … id=…).",
      "- No inventes URLs: link_fuente_oficial / fuente_verificada_url solo si salen del CONTEXTO o son oficiales inequívocos; si no, null.",
      "- Solo items: [] si la descripción es ilegible o imposible vincular a obligaciones razonables.",
      "",
      `NEGOCIO: nombre=${negocio.nombre} sector=${negocio.sector ?? "—"}`,
      `descripcion_general=${negocio.detalles_negocio ?? "—"}`,
      `regulacion_especial=${negocio.regulacion_actividades_especiales ?? "—"}`,
      actividadNombre ? `ACTIVIDAD_VINCULADA=${actividadNombre}` : "ACTIVIDAD_VINCULADA=(ninguna)",
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
    const parsed = JSON.parse(m[0]) as { items?: ItemTarea[] };
    let items = Array.isArray(parsed.items) ? (parsed.items as ItemTarea[]) : [];

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        items_generados: 0,
        aviso:
          "La IA no devolvió ítems. Prueba con una descripción más concreta o sube en AI Notebook el Código del Trabajo u otra norma laboral para reforzar el contexto."
      });
    }

    const payload = items.map((it) => {
      const multa = estimateUsdFromSanction(it.sancion);
      const score = computePriorityScore(it.impacto_economico, it.probabilidad_incumplimiento);
      const prioridad = classifyPrioridad({ sancion: it.sancion, multa_estimada_usd: multa, priorityScore: score });
      const respaldado = it.respaldado_en_biblioteca === true && hayDocs;
      let observaciones = (it.observaciones ?? "").trim();
      if (!respaldado && !observaciones.toLowerCase().includes("biblioteca del sistema")) {
        observaciones = observaciones ? `${AVISO_SIN_BIBLIOTECA} ${observaciones}` : AVISO_SIN_BIBLIOTECA;
      }
      const org = normalizeOrganizacion4(it);
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
        observaciones: observaciones || null,
        proceso_actividad_relacionada: it.proceso_actividad_relacionada ?? null,
        sponsor: org.sponsor,
        responsable_proceso: org.responsable_proceso,
        gerencia_competente: org.gerencia_competente,
        area_competente: org.area_competente,
        multa_estimada_usd: multa,
        impacto_economico: it.impacto_economico,
        probabilidad_incumplimiento: it.probabilidad_incumplimiento,
        prioridad,
        actividad_id: body.actividad_id ?? null,
        estado: "pendiente" as const,
        extra: {
          origen: "tarea_especifica",
          descripcion_tarea: body.descripcion,
          generado_por: userData.user.id,
          actividad_nombre: actividadNombre,
          respaldado_en_biblioteca: respaldado,
          biblioteca_tenia_docs: hayDocs
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
