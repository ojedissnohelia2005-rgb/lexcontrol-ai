import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateAiText } from "@/lib/ai";

const BodySchema = z.object({
  negocio_id: z.string().uuid().optional(),
  doc_id: z.string().uuid().optional(), // si se envía, pregunta sobre un PDF específico
  question: z.string().min(3),
  scope: z.enum(["doc", "all"]).default("all")
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const q = body.question.trim();
    const scope = body.scope;

    let docsQuery = supabase.from("normativa_docs").select("id,titulo,fuente_url,storage_path,texto_extraido,created_at");
    if (body.doc_id) docsQuery = docsQuery.eq("id", body.doc_id);
    else docsQuery = docsQuery.is("negocio_id", null);

    const { data: docs, error: dErr } = await docsQuery.order("created_at", { ascending: false }).limit(scope === "doc" ? 1 : 6);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    const context = (docs ?? [])
      .map((d) => {
        const fuente = d.fuente_url || d.storage_path || "";
        return [
          `DOC_ID: ${d.id}`,
          `TITULO: ${d.titulo ?? "—"}`,
          fuente ? `FUENTE_VERIFICADA_URL: ${fuente}` : "",
          "TEXTO:",
          String(d.texto_extraido ?? "").slice(0, 30_000)
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n---\n\n");

    if (!context) {
      return NextResponse.json({ error: "No hay PDFs en la memoria normativa para responder." }, { status: 400 });
    }

    const prompt = [
      "Eres un asistente LegalTech para Ecuador (2026).",
      "Responde SOLO con información que esté respaldada por el CONTEXTO (PDFs).",
      "Si no hay evidencia en el contexto, di: 'No consta en los PDFs cargados'.",
      "Incluye siempre una sección 'Fuente verificada' con el DOC_ID y el enlace (FUENTE_VERIFICADA_URL) usado.",
      "",
      `Pregunta: ${q}`,
      "",
      "CONTEXTO (extractos de PDFs):",
      context
    ].join("\n");

    const answer = await generateAiText(prompt);

    return NextResponse.json({
      answer,
      used_docs: (docs ?? []).map((d) => ({
        id: d.id,
        titulo: d.titulo,
        fuente_verificada_url: d.fuente_url || d.storage_path || null
      }))
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

