import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAiText } from "@/lib/ai";
import { classifyPrioridad, computePriorityScore, estimateUsdFromSanction } from "@/lib/finance";
import { MENSAJE_SIN_NORMATIVA_EN_BASE } from "@/lib/matrix-ai-messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  matriz_row_id: z.string().uuid().optional(),
  max_rows: z.number().int().min(1).max(40).optional()
});

const FillOut = z
  .object({
    tipo_norma: z.string().optional(),
    norma_nombre: z.string().optional(),
    fecha_publicacion: z.string().optional(),
    organismo_emisor: z.string().optional(),
    resumen_experto: z.string().optional(),
    campo_juridico: z.string().optional(),
    observaciones: z.string().optional(),
    proceso_actividad_relacionada: z.string().optional(),
    sponsor: z.string().optional(),
    responsable_proceso: z.string().optional(),
    articulo: z.string().optional(),
    requisito: z.string().optional(),
    sancion: z.string().optional(),
    responsable: z.string().optional(),
    gerencia_competente: z.string().optional(),
    area_competente: z.string().optional(),
    link_fuente_oficial: z.string().optional(),
    fuente_verificada_url: z.string().optional(),
    cita_textual: z.string().optional(),
    evidencia_url: z.string().optional(),
    multa_estimada_usd: z.number().optional(),
    impacto_economico: z.number().int().min(1).max(10).optional(),
    probabilidad_incumplimiento: z.number().int().min(1).max(5).optional(),
    prioridad: z.enum(["critico", "alto", "medio", "bajo"]).optional()
  })
  .partial()
  .passthrough();

function isEmptyVal(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function parseAiJson(text: string): unknown {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());
    const maxRows = body.max_rows ?? 20;

    const { data: negocio, error: nErr } = await supabase
      .from("negocios")
      .select("id,nombre,sector,detalles_negocio")
      .eq("id", body.negocio_id)
      .maybeSingle();
    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 400 });
    if (!negocio) return NextResponse.json({ error: "Negocio no encontrado o sin acceso" }, { status: 403 });

    let query = supabase
      .from("matriz_cumplimiento")
      .select(
        "id,negocio_id,tipo_norma,norma_nombre,fecha_publicacion,organismo_emisor,resumen_experto,campo_juridico,observaciones,proceso_actividad_relacionada,sponsor,responsable_proceso,articulo,requisito,sancion,multa_estimada_usd,impacto_economico,probabilidad_incumplimiento,prioridad,responsable,gerencia_competente,area_competente,link_fuente_oficial,fuente_verificada_url,cita_textual,evidencia_url,normativa_doc_id"
      )
      .eq("negocio_id", body.negocio_id);

    if (body.matriz_row_id) query = query.eq("id", body.matriz_row_id);

    const { data: rows, error: mErr } = await query.order("created_at", { ascending: false }).limit(maxRows);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });

    const list = (rows ?? []) as Record<string, unknown>[];
    let updated = 0;
    const notes: string[] = [];
    let anySinNormativa = false;

    for (const row of list) {
      const id = String(row.id);
      const emptyFields: string[] = [];
      for (const k of [
        "tipo_norma",
        "norma_nombre",
        "fecha_publicacion",
        "organismo_emisor",
        "resumen_experto",
        "campo_juridico",
        "observaciones",
        "proceso_actividad_relacionada",
        "sponsor",
        "responsable_proceso",
        "articulo",
        "requisito",
        "sancion",
        "responsable",
        "gerencia_competente",
        "area_competente",
        "link_fuente_oficial",
        "fuente_verificada_url",
        "cita_textual",
        "evidencia_url"
      ]) {
        if (isEmptyVal(row[k])) emptyFields.push(k);
      }
      if (row.multa_estimada_usd == null) emptyFields.push("multa_estimada_usd");
      if (row.impacto_economico == null) emptyFields.push("impacto_economico");
      if (row.probabilidad_incumplimiento == null) emptyFields.push("probabilidad_incumplimiento");
      if (isEmptyVal(row.prioridad)) emptyFields.push("prioridad");

      if (emptyFields.length === 0) continue;

      let normativaExcerpt = "";
      const docId = row.normativa_doc_id as string | null | undefined;
      if (docId) {
        const { data: doc } = await supabase
          .from("normativa_docs")
          .select("titulo,texto_extraido")
          .eq("id", docId)
          .maybeSingle();
        const titulo = (doc as { titulo?: string } | null)?.titulo ?? "";
        const texto = (doc as { texto_extraido?: string } | null)?.texto_extraido ?? "";
        normativaExcerpt = `Título norma: ${titulo}\nExtracto (truncado):\n${texto.slice(0, 12_000)}`;
      }

      const negocioCtx = `Negocio: ${(negocio as { nombre?: string }).nombre ?? "—"}\nSector: ${(negocio as { sector?: string }).sector ?? "—"}\nDetalles: ${(negocio as { detalles_negocio?: string }).detalles_negocio ?? "—"}`;

      const rowJson = JSON.stringify(
        {
          articulo: row.articulo,
          requisito: row.requisito,
          sancion: row.sancion,
          tipo_norma: row.tipo_norma,
          norma_nombre: row.norma_nombre,
          organismo_emisor: row.organismo_emisor
        },
        null,
        0
      );

      const prompt = [
        "Eres analista senior de cumplimiento normativo en Ecuador (2026).",
        "Tienes una FILA de matriz (JSON), contexto del negocio y, si existe, un extracto de normativa cargada en el sistema.",
        "",
        "Prioridad de trabajo (en este orden):",
        "1) Razona con tu conocimiento jurídico actual y el contexto del negocio + la fila (artículo, requisito, organismo, tipo de norma, etc.) para completar los campos vacíos con la mayor precisión y utilidad práctica posible.",
        "2) Si hay extracto normativo en base, úsalo como apoyo principal para precisiones, citas y coherencia con el texto.",
        "3) Sé explícito cuando algo sea estimación razonable (p. ej. multas aproximadas) frente a dato textual del extracto.",
        "4) No inventes URLs: link_fuente_oficial y fuente_verificada_url solo si constan en el extracto o son enlaces oficiales inequívocos que puedas nombrar con dominio real verificable; si no, omite esas claves.",
        "",
        "Respuesta en JSON (sin markdown):",
        "- Incluye SOLO claves de la lista de campos vacíos que puedas llenar de forma defendible.",
        `Campos vacíos candidatos: ${emptyFields.join(", ")}.`,
        "fecha_publicacion en formato YYYY-MM-DD cuando aplique.",
        "impacto_economico: entero 1-10; probabilidad_incumplimiento: entero 1-5; multa_estimada_usd: número en USD cuando haya base razonable (si no, omite).",
        "prioridad solo si está vacía: critico | alto | medio | bajo según gravedad.",
        "",
        "EXCEPCIÓN (último recurso, debe ser rara): solo si, tras razonar, no puedes completar ningún campo vacío con ningún grado útil de certeza (p. ej. fila totalmente aislada sin norma, sector o requisito identificable), responde ÚNICAMENTE:",
        '{"sin_normativa_en_base":true}',
        "No uses sin_normativa_en_base por comodidad; el caso normal es devolver campos rellenados.",
        "",
        "### Contexto negocio\n" + negocioCtx,
        "",
        "### Fila (campos clave)\n" + rowJson,
        "",
        "### Extracto normativa (opcional)\n" +
          (normativaExcerpt || "(sin documento vinculado: completa igualmente lo que el contexto y tu conocimiento permitan; reserva sin_normativa_en_base solo si es imposible aportar nada útil.)"),
        "",
        "Responde únicamente con el objeto JSON."
      ].join("\n");

      let raw: string;
      try {
        raw = await generateAiText(prompt);
      } catch (e: unknown) {
        notes.push(`${id}: ${e instanceof Error ? e.message : "IA error"}`);
        continue;
      }

      let parsedRaw: unknown;
      try {
        parsedRaw = parseAiJson(raw);
      } catch {
        notes.push(`${id}: JSON inválido de la IA`);
        continue;
      }

      const rawObj = parsedRaw && typeof parsedRaw === "object" && !Array.isArray(parsedRaw) ? (parsedRaw as Record<string, unknown>) : null;
      if (rawObj?.sin_normativa_en_base === true || rawObj?.sin_normativa_en_base === "true") {
        anySinNormativa = true;
        notes.push(`${id}: sin normativa en base (IA)`);
        continue;
      }

      const parsed = FillOut.safeParse(parsedRaw);
      if (!parsed.success) {
        notes.push(`${id}: formato de IA no válido`);
        continue;
      }

      const patch: Record<string, unknown> = {};
      const p = parsed.data;
      const tryStr = (key: keyof typeof p) => {
        if (!emptyFields.includes(key as string)) return;
        const v = p[key];
        if (typeof v === "string" && v.trim()) patch[key] = v.trim();
      };

      tryStr("tipo_norma");
      tryStr("norma_nombre");
      tryStr("fecha_publicacion");
      tryStr("organismo_emisor");
      tryStr("resumen_experto");
      tryStr("campo_juridico");
      tryStr("observaciones");
      tryStr("proceso_actividad_relacionada");
      tryStr("sponsor");
      tryStr("responsable_proceso");
      tryStr("articulo");
      tryStr("requisito");
      tryStr("sancion");
      tryStr("responsable");
      tryStr("gerencia_competente");
      tryStr("area_competente");
      tryStr("link_fuente_oficial");
      tryStr("fuente_verificada_url");
      tryStr("cita_textual");
      tryStr("evidencia_url");

      if (emptyFields.includes("multa_estimada_usd") && typeof p.multa_estimada_usd === "number" && Number.isFinite(p.multa_estimada_usd)) {
        patch.multa_estimada_usd = p.multa_estimada_usd;
      }
      if (emptyFields.includes("impacto_economico") && typeof p.impacto_economico === "number") {
        patch.impacto_economico = p.impacto_economico;
      }
      if (emptyFields.includes("probabilidad_incumplimiento") && typeof p.probabilidad_incumplimiento === "number") {
        patch.probabilidad_incumplimiento = p.probabilidad_incumplimiento;
      }
      if (emptyFields.includes("prioridad") && p.prioridad) {
        patch.prioridad = p.prioridad;
      }

      const mergedSancion = typeof patch.sancion === "string" ? patch.sancion : (row.sancion as string | null);
      if (row.multa_estimada_usd == null && patch.multa_estimada_usd == null && mergedSancion) {
        const est = estimateUsdFromSanction(mergedSancion);
        if (est != null) patch.multa_estimada_usd = est;
      }

      const iE = (patch.impacto_economico ?? row.impacto_economico) as number | null | undefined;
      const pI = (patch.probabilidad_incumplimiento ?? row.probabilidad_incumplimiento) as number | null | undefined;
      const multa = (patch.multa_estimada_usd ?? row.multa_estimada_usd) as number | null | undefined;
      if (!patch.prioridad && isEmptyVal(row.prioridad)) {
        const score = computePriorityScore(iE, pI);
        patch.prioridad = classifyPrioridad({
          sancion: mergedSancion,
          multa_estimada_usd: multa ?? null,
          priorityScore: score
        });
      }

      if (Object.keys(patch).length === 0) {
        notes.push(`${id}: IA no aplicó valores válidos tras validación`);
        continue;
      }

      const { error: uErr } = await supabase.from("matriz_cumplimiento").update(patch).eq("id", id);
      if (uErr) {
        notes.push(`${id}: ${uErr.message}`);
        continue;
      }
      updated += 1;
    }

    return NextResponse.json({
      ok: true,
      updated,
      processed: list.length,
      notes,
      sin_normativa_aviso: anySinNormativa ? MENSAJE_SIN_NORMATIVA_EN_BASE : undefined
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
