import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateAiText } from "@/lib/ai";
import { extractFirstBalancedJsonObject } from "@/lib/ai-json";

const BodySchema = z.object({
  numero_proceso: z.string().min(1),
  resumen_caso: z.string().min(80),
  materia: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());
    const prompt = [
      "Eres abogado litigante ecuatoriano con trayectoria. Analiza el caso y responde SOLO JSON válido (sin markdown):",
      `{"sintesis":"...","hechos_clave":["..."],"puntos_debiles":["..."],"puntos_fuertes":["..."],"riesgos_procesales":["..."],"estrategia_sugerida":"...","preguntas_pendientes":["..."],"recomendacion_aprobacion":"aprobar|revisar|rechazar"}`,
      `Proceso: ${body.numero_proceso}`,
      `Materia: ${body.materia ?? "no indicada"}`,
      "Resumen del cliente:",
      body.resumen_caso
    ].join("\n");

    const text = await generateAiText(prompt, { maxOutputTokens: 4096 });
    const jsonStr = extractFirstBalancedJsonObject(text);
    if (!jsonStr) {
      return NextResponse.json({
        ok: true,
        ficha: { sintesis: text.slice(0, 2000), recomendacion_aprobacion: "revisar" },
        raw: true
      });
    }
    const ficha = JSON.parse(jsonStr) as Record<string, unknown>;
    return NextResponse.json({ ok: true, ficha, estado: "pendiente_aprobacion" });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error IA" }, { status: 400 });
  }
}
