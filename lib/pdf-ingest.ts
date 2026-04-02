import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractPdfText } from "@/lib/pdf";
import { sha256Hex } from "@/lib/hash";
import { compareNormativaWithGemini, extractNormativaMetaGemini } from "@/lib/gemini-normativa";
import { normalizeNormativaTitle } from "@/lib/normativa-titles";
import type { ComparacionNormativa } from "@/types/domain";

export class PdfIngestError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code?: string,
    public readonly extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PdfIngestError";
  }
}

export type IngestPdfResult = {
  items: unknown[];
  normativa_doc_id: string;
  sha256: string;
  comparacion: ComparacionNormativa;
  fuente_url: string | null;
  storage_path: string | null;
};

/**
 * Pipeline completo: texto PDF → Storage → normativa_docs → comparación IA → extracción Gemini.
 */
export async function ingestNormativaPdf(
  supabase: SupabaseClient,
  params: {
    userId: string;
    negocioId: string;
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    fuente_url_in: string | null;
    storage_path_in: string | null;
    /** URL absoluta del endpoint /api/gemini/extract */
    extractApiUrl: string;
  }
): Promise<IngestPdfResult> {
  const { userId, negocioId, buffer, fileName, mimeType, fuente_url_in, storage_path_in, extractApiUrl } = params;

  const texto = await extractPdfText(buffer);
  if (!texto || texto.length < 50) {
    throw new Error("No se pudo extraer texto del PDF");
  }

  const sha256 = sha256Hex(buffer);

  let storage_path = storage_path_in;
  let fuente_url = fuente_url_in;
  if (!storage_path) {
    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para subir el PDF a almacenamiento.");
    }
    const safeName = fileName.replace(/[^\w.\- ]+/g, "_");
    storage_path = `normativa/global/${Date.now()}-${safeName}`;
    const { error: upErr } = await admin.storage.from("evidencias-legales").upload(storage_path, buffer, {
      contentType: mimeType || "application/pdf",
      upsert: true,
      cacheControl: "3600"
    });
    if (upErr) throw new Error(`Storage upload: ${upErr.message}`);
    const { data: pub } = admin.storage.from("evidencias-legales").getPublicUrl(storage_path);
    fuente_url = fuente_url_in?.trim() || pub.publicUrl || null;
  }

  const { data: biz, error: bErr } = await supabase
    .from("negocios")
    .select(
      "id,nombre,sector,detalles_negocio,regulacion_actividades_especiales,normativa_actualizar_nota,normativa_actualizar_urls"
    )
    .eq("id", negocioId)
    .single();
  if (bErr) throw new Error(bErr.message);

  const contexto_rubro =
    [
      (biz as { regulacion_actividades_especiales?: string | null })?.regulacion_actividades_especiales
        ? `Actividades reguladas: ${(biz as { regulacion_actividades_especiales?: string }).regulacion_actividades_especiales}`
        : "",
      (biz as { normativa_actualizar_nota?: string | null })?.normativa_actualizar_nota
        ? `Normativa a actualizar (nota): ${(biz as { normativa_actualizar_nota?: string }).normativa_actualizar_nota}`
        : "",
      (biz as { normativa_actualizar_urls?: string | null })?.normativa_actualizar_urls
        ? `Enlaces de referencia (usuario): ${(biz as { normativa_actualizar_urls?: string }).normativa_actualizar_urls}`
        : ""
    ]
      .filter(Boolean)
      .join("\n") || null;

  const meta = await extractNormativaMetaGemini({ file_name: fileName, texto });
  const tituloDetectado = meta.titulo_detectado ?? fileName;

  const rowBase = {
    negocio_id: null as string | null,
    titulo: tituloDetectado,
    fuente_url: fuente_url,
    storage_path: storage_path,
    mime_type: mimeType || "application/pdf",
    texto_extraido: texto,
    sha256,
    fecha_normativa: meta.fecha_normativa_iso,
    created_by: userId
  };

  let inserted: { id: string; created_at: string; titulo: string | null } | null = null;
  let nErr: { message: string } | null = null;

  const insWithCls = await supabase
    .from("normativa_docs")
    .insert({ ...rowBase, clasificacion_documento: meta.clasificacion_documento })
    .select("id,created_at,titulo")
    .single();
  inserted = insWithCls.data;
  nErr = insWithCls.error;

  if (nErr && /clasificacion_documento/i.test(nErr.message)) {
    const insFallback = await supabase.from("normativa_docs").insert(rowBase).select("id,created_at,titulo").single();
    inserted = insFallback.data;
    nErr = insFallback.error;
  }
  if (nErr) throw new Error(nErr.message);
  if (!inserted) throw new Error("No se pudo registrar el documento");

  try {
    const { data: allNorm } = await supabase.from("normativa_docs").select("id,titulo,created_at").is("negocio_id", null);

    const groups = new Map<string, { id: string; created_at: string; titulo: string | null }[]>();
    for (const row of allNorm ?? []) {
      const k = normalizeNormativaTitle(row.titulo);
      if (k.length < 8) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ id: row.id, created_at: row.created_at, titulo: row.titulo });
    }

    for (const [, rows] of groups) {
      if (rows.length < 2) continue;
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const keep = rows[rows.length - 1]!.id;
      const remove = rows.filter((r) => r.id !== keep).map((r) => r.id);
      if (remove.length === 0) continue;
      await supabase.from("normativa_docs").delete().in("id", remove);
      const tituloRef = rows[rows.length - 1]!.titulo ?? tituloDetectado;
      await supabase.from("alertas_actualizacion_normativa").insert({
        normativa_doc_id: keep,
        tiene_posible_actualizacion: true,
        nivel_confianza: 1,
        comentario:
          "Sistema: normativa duplicada por título (IA). Se conservó la versión más reciente y se eliminaron cargas anteriores. " +
          `IDs eliminados: ${remove.join(", ")}. Super admin: revise propuestas/matriz y deshaga manualmente si no corresponde. Norma: ${tituloRef ?? "—"}`,
        revisado: false
      });
    }
  } catch {
    /* no romper flujo */
  }

  const { data: siblings } = await supabase
    .from("normativa_docs")
    .select("id,titulo,texto_extraido,sha256,fecha_normativa")
    .is("negocio_id", null)
    .neq("id", inserted.id);

  const existentes = siblings ?? [];
  let comparacion = await compareNormativaWithGemini({
    titulo_nuevo: fileName,
    texto_nuevo: texto,
    sha256_nuevo: sha256,
    existentes: existentes.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      texto_extraido: e.texto_extraido,
      fecha_normativa: e.fecha_normativa
    }))
  });

  const hashDupe = existentes.find((e) => e.sha256 && e.sha256 === sha256);
  if (hashDupe) {
    comparacion = {
      relacion: "MISMA_NORMA",
      doc_coincidente_id: hashDupe.id,
      nueva_es_mas_reciente: null,
      confianza: 1,
      razon: "Mismo archivo (hash idéntico a un documento ya cargado)."
    };
  }

  const res = await fetch(extractApiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      texto,
      fuente_url,
      negocio: {
        nombre: (biz as { nombre?: string }).nombre ?? null,
        sector: (biz as { sector?: string }).sector ?? null,
        detalles: (biz as { detalles_negocio?: string }).detalles_negocio ?? null,
        contexto_rubro: contexto_rubro
      }
    })
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 429 && data?.code === "GEMINI_QUOTA") {
      throw new PdfIngestError(String(data.error ?? "Cuota IA"), 429, "GEMINI_QUOTA", {
        retry_after_seconds: data.retry_after_seconds
      });
    }
    throw new PdfIngestError(String(data?.error ?? "Gemini error"), res.status >= 400 ? res.status : 502, undefined, {
      raw: data
    });
  }

  const itemsOut = Array.isArray(data.items) ? data.items : [];
  return {
    items: itemsOut,
    normativa_doc_id: inserted.id,
    sha256,
    comparacion,
    fuente_url,
    storage_path
  };
}
