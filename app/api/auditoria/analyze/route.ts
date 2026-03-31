import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiFlashModel } from "@/lib/gemini";
import { extractPdfText } from "@/lib/pdf";

const JsonSchema = z.object({
  resumen_ia: z.string().optional(),
  riesgos: z.array(z.record(z.unknown())).optional()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const ct = req.headers.get("content-type") ?? "";
    let negocio_id: string;
    let titulo: string;
    let texto: string;
    let storage_path: string | null = null;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      negocio_id = z.string().uuid().parse(String(form.get("negocio_id") ?? ""));
      titulo = String(form.get("titulo") ?? "Informe de auditoría");
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

      const buf = Buffer.from(await file.arrayBuffer());
      if (file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
        texto = await extractPdfText(buf);
      } else {
        texto = buf.toString("utf-8");
      }
      if (!texto || texto.length < 20) return NextResponse.json({ error: "No se pudo leer el informe" }, { status: 400 });

      const path = `${userData.user.id}/auditoria/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("evidencias-legales").upload(path, file, { upsert: true });
      if (!upErr) storage_path = path;
    } else {
      const body = z
        .object({
          negocio_id: z.string().uuid(),
          titulo: z.string().min(1),
          texto: z.string().min(20)
        })
        .parse(await req.json());
      negocio_id = body.negocio_id;
      titulo = body.titulo;
      texto = body.texto;
    }

    const model = getGeminiFlashModel();
    const prompt = [
      "Eres auditor legal/compliance (Ecuador 2026). A partir del siguiente informe de auditoría externa,",
      "extrae riesgos de cumplimiento accionables para una matriz normativa.",
      "Devuelve SOLO JSON válido:",
      "{ resumen_ia: string, riesgos: [{ articulo, requisito, sancion, recomendacion, impacto_economico (1-10), probabilidad_incumplimiento (1-5), cita_textual }] }",
      "",
      "TEXTO INFORME:",
      texto.slice(0, 100_000)
    ].join("\n");

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: "Gemini sin JSON", raw }, { status: 502 });
    const parsed = JsonSchema.parse(JSON.parse(m[0]));
    const riesgos = (parsed.riesgos ?? []).filter((r) => typeof r === "object" && r !== null && typeof (r as { requisito?: unknown }).requisito === "string");
    const resumen_ia = parsed.resumen_ia ?? "";

    const { data: inserted, error: insErr } = await supabase
      .from("auditoria_externa_reportes")
      .insert({
        negocio_id,
        titulo,
        storage_path,
        resumen_ia,
        riesgos_json: riesgos,
        created_by: userData.user.id
      })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "AUDITORIA_EXTERNA_ANALIZAR",
      tabla: "auditoria_externa_reportes",
      registro_id: inserted?.id,
      valor_nuevo: { titulo, riesgos: riesgos.length }
    });

    return NextResponse.json({ ok: true, reporte_id: inserted?.id, resumen_ia, riesgos });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
