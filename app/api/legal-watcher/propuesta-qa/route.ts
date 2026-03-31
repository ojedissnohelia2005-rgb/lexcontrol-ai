import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiFlashModel } from "@/lib/gemini";

const BodySchema = z.object({
  propuesta_id: z.string().uuid(),
  pregunta: z.string().min(3)
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const { data: p, error } = await supabase
      .from("propuestas_pendientes")
      .select("id,articulo,requisito,sancion,cita_textual,link_fuente_oficial,fuente_verificada_url,extra")
      .eq("id", body.propuesta_id)
      .single();
    if (error || !p) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

    const model = getGeminiFlashModel();
    const prompt = [
      "Eres asesor legal/compliance (Ecuador 2026). Responde la pregunta del usuario sobre si conviene incorporar esta propuesta a la matriz de cumplimiento.",
      "Sé claro y prudente: si no hay evidencia suficiente, dilo.",
      "Al final, si aplica, una línea: CONCLUSION: AGREGAR | NO_AGREGAR | INVESTIGAR_MAS.",
      "",
      "Propuesta:",
      JSON.stringify(p, null, 2),
      "",
      "Pregunta:",
      body.pregunta.trim()
    ].join("\n");

    const result = await model.generateContent(prompt);
    const respuesta = result.response.text().trim();

    return NextResponse.json({ respuesta });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
