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

const MAX_DOCS = 10;
const CHARS_PER_DOC = 14_000;

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

    const context =
      (docs ?? []).length > 0
        ? (docs ?? [])
            .map((d, i) => {
              return [
                `### DOC ${i + 1} id=${d.id} titulo=${d.titulo ?? "—"}`,
                String(d.texto_extraido ?? "").slice(0, CHARS_PER_DOC)
              ].join("\n");
            })
            .join("\n\n")
        : "(No hay PDFs indexados aún en la biblioteca global ni en este negocio; igual debes razonar con conocimiento jurídico aplicable.)";

    const prompt = [
      "Eres analista senior de cumplimiento normativo en Ecuador (2026).",
      "",
      "El usuario describe una TAREA ESPECÍFICA del negocio que puede no estar cubierta en la descripción general.",
      "",
      "Fuentes de trabajo (en este orden):",
      "1) CONTEXTO_NORMATIVO: extractos de PDFs ya cargados en el sistema (biblioteca común y/o normativa del negocio). Si un fragmento respalda un requisito, úsalo en cita_textual y enlaces si constan.",
      "2) Conocimiento jurídico general: Código del Trabajo, reglamentos y normativa sectorial típica en Ecuador cuando la tarea o la actividad vinculada lo exijan (p. ej. obligaciones laborales, higiene, contratos, horarios, salud ocupacional, igualdad, etc.).",
      "3) Cruza con nombre del negocio, sector, descripción y regulación especial para que cada requisito sea aplicable y accionable.",
      "",
      "Obligatorio sobre la salida:",
      "- Devuelve un JSON ÚNICO con forma:",
      "  { items: [ { tipo_norma, norma_nombre, fecha_publicacion, organismo_emisor, resumen_experto, campo_juridico, observaciones, proceso_actividad_relacionada, sponsor, responsable_proceso, articulo, requisito, sancion, cita_textual, link_fuente_oficial, fuente_verificada_url, area_competente, gerencia_competente, impacto_economico, probabilidad_incumplimiento } ] }",
      "- Si la tarea es coherente y existe marco legal aplicable (laboral u otro), genera **al menos 3** ítems y **idealmente entre 4 y 8**, salvo que la descripción sea tan acotada que solo procedan 1–2; en ese caso explica en observaciones.",
      "- Cada ítem: requisito medible, articulo referencial (p. ej. artículo o sección del Código del Trabajo o norma que cites), norma_nombre explícita.",
      "- En observaciones indica si el texto debe verificarse en el Registro Oficial o fuente .gob.ec cuando uses conocimiento general sin extracto en CONTEXTO.",
      "- No inventes URLs: link_fuente_oficial / fuente_verificada_url solo si son fiables o salen del CONTEXTO; si no, omite o deja null.",
      "- Solo items: [] si la descripción es ilegible, fuera de alcance legal o imposible vincular a obligaciones razonables.",
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
    const parsed = JSON.parse(m[0]) as { items?: GeminiExtractionItem[] };
    let items = Array.isArray(parsed.items) ? (parsed.items as GeminiExtractionItem[]) : [];

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
          generado_por: userData.user.id,
          actividad_nombre: actividadNombre
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
