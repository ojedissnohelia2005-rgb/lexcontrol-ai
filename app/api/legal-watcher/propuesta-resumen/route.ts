import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiFlashModel } from "@/lib/gemini";

const BodySchema = z.object({
  propuesta_id: z.string().uuid()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const { data: p, error } = await supabase
      .from("propuestas_pendientes")
      .select("id,articulo,requisito,sancion,cita_textual,link_fuente_oficial,extra")
      .eq("id", body.propuesta_id)
      .single();
    if (error || !p) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

    const model = getGeminiFlashModel();
    const prompt = [
      "Eres analista de cumplimiento (Ecuador 2026). Tienes una FILA PROPUESTA (posible cambio normativo / vigilancia).",
      "Entrega un resumen ejecutivo en español con:",
      "1) Qué implica para el negocio (en general).",
      "2) Riesgo aparente (bajo/medio/alto) y por qué.",
      "3) Recomendación: ¿tiene sentido agregarlo a la matriz de cumplimiento? Responde al final con una línea: DECISIÓN_SUGERIDA: SI | NO | REVISAR.",
      "",
      "Datos propuesta:",
      JSON.stringify(p, null, 2)
    ].join("\n");

    const result = await model.generateContent(prompt);
    const resumen = result.response.text().trim();

    return NextResponse.json({ resumen });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
