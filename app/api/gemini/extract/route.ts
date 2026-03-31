import { NextResponse } from "next/server";
import { z } from "zod";
import { getGeminiFlashModel } from "@/lib/gemini";

const BodySchema = z.object({
  texto: z.string().min(50),
  negocio: z
    .object({
      nombre: z.string().optional(),
      sector: z.string().nullable().optional(),
      detalles: z.string().nullable().optional(),
      contexto_rubro: z.string().nullable().optional()
    })
    .optional(),
  fuente_url: z.string().url().nullable().optional()
});

export type GeminiExtractionItem = {
  tipo_norma?: string | null;
  norma_nombre?: string | null;
  fecha_publicacion?: string | null; // YYYY-MM-DD
  organismo_emisor?: string | null;
  resumen_experto?: string | null;
  campo_juridico?: string | null;
  observaciones?: string | null;
  proceso_actividad_relacionada?: string | null;
  sponsor?: string | null;
  responsable_proceso?: string | null;
  articulo: string;
  requisito: string;
  sancion: string | null;
  cita_textual: string | null;
  link_fuente_oficial: string | null;
  fuente_verificada_url: string | null;
  area_competente: string | null;
  gerencia_competente: string | null;
  impacto_economico: number | null;
  probabilidad_incumplimiento: number | null;
};

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    const model = getGeminiFlashModel();

    const prompt = [
      "Eres un analista legal de cumplimiento en Ecuador (2026).",
      "A partir del texto de una normativa ecuatoriana, extrae una lista de requisitos accionables para una Matriz de Cumplimiento.",
      "Devuelve SOLO JSON válido con la forma:",
      "{ items: [ { tipo_norma, norma_nombre, fecha_publicacion, organismo_emisor, resumen_experto, campo_juridico, observaciones, proceso_actividad_relacionada, sponsor, responsable_proceso, articulo, requisito, sancion, cita_textual, link_fuente_oficial, fuente_verificada_url, area_competente, gerencia_competente, impacto_economico, probabilidad_incumplimiento } ] }",
      "",
      "Reglas:",
      "- Si identificas el nombre oficial de la norma, colócalo en 'norma_nombre'.",
      "- 'fecha_publicacion' debe ser YYYY-MM-DD si se identifica claramente, si no null.",
      "- 'articulo' puede ser 'Art. 123' o similar si existe; si no, usa '—'.",
      "- 'requisito' debe ser específico, verificable y orientado a evidencia.",
      "- 'sancion' puede ser null si no está explícita.",
      "- 'cita_textual' debe ser un fragmento literal breve del texto.",
      "- 'link_fuente_oficial' debe ser la fuente oficial si aparece; si no, null.",
      "- 'fuente_verificada_url' debe ser el link oficial o el PDF subido (usa fuente_url si se provee).",
      "- 'resumen_experto' es un resumen en 1-2 líneas para lectura ejecutiva.",
      "- 'campo_juridico' por ejemplo: tributario, laboral, ambiental, hidrocarburos, societario, datos personales, etc.",
      "- 'impacto_economico' (1-10) y 'probabilidad_incumplimiento' (1-5) como estimación.",
      "",
      body.negocio?.nombre
        ? [
            `Contexto negocio: ${body.negocio.nombre} | Sector: ${body.negocio.sector ?? "—"} | Detalles: ${body.negocio.detalles ?? "—"}`,
            body.negocio.contexto_rubro ? `Rubro / regulación especial / normativa a vigilar: ${body.negocio.contexto_rubro}` : ""
          ]
            .filter(Boolean)
            .join("\n")
        : "Contexto negocio: (no provisto)",
      "",
      body.fuente_url ? `Fuente proporcionada: ${body.fuente_url}` : "",
      "",
      "TEXTO NORMATIVO (recortado si es largo):",
      body.texto.slice(0, 120_000)
    ]
      .filter(Boolean)
      .join("\n");

    let text = "";
    try {
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.toLowerCase();
      if (m.includes("429") || m.includes("quota") || m.includes("too many requests")) {
        const retry = msg.match(/retry in ([0-9.]+)s/i)?.[1];
        return NextResponse.json(
          {
            error: `Gemini sin cuota (429). ${retry ? `Reintenta en ~${Math.ceil(Number(retry))}s.` : "Espera y vuelve a intentar."}`,
            code: "GEMINI_QUOTA",
            retry_after_seconds: retry ? Math.ceil(Number(retry)) : 60
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Best-effort JSON extraction
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Gemini no devolvió JSON", raw: text }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { items?: GeminiExtractionItem[] };
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return NextResponse.json({ items });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en extracción Gemini" },
      { status: 400 }
    );
  }
}

