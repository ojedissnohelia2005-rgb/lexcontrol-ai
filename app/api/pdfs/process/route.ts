import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractPdfText } from "@/lib/pdf";
import { sha256Hex } from "@/lib/hash";
import { compareNormativaWithGemini, extractNormativaMetaGemini } from "@/lib/gemini-normativa";

/** Vercel / Node: PDF + Storage + IA puede superar el default de 10s en plan Pro. */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    const negocio_id = String(form.get("negocio_id") ?? "");
    const fuente_url_in = String(form.get("fuente_url") ?? "") || null;
    const storage_path_in = String(form.get("storage_path") ?? "") || null;

    if (!(file instanceof File)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
    if (!negocio_id) return NextResponse.json({ error: "negocio_id requerido" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sha256 = sha256Hex(buffer);
    const texto = await extractPdfText(buffer);
    if (!texto || texto.length < 50) return NextResponse.json({ error: "No se pudo extraer texto del PDF" }, { status: 400 });

    // Subida a Storage (server-side) para evitar RLS del cliente.
    // Si ya viene storage_path (compatibilidad), se respeta.
    let storage_path = storage_path_in;
    let fuente_url = fuente_url_in;
    if (!storage_path) {
      const admin = createSupabaseAdminClient();
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
      storage_path = `normativa/${negocio_id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await admin.storage.from("evidencias-legales").upload(storage_path, buffer, {
        contentType: file.type || "application/pdf",
        upsert: true,
        cacheControl: "3600"
      });
      if (upErr) return NextResponse.json({ error: `Storage upload: ${upErr.message}` }, { status: 400 });
      const { data: pub } = admin.storage.from("evidencias-legales").getPublicUrl(storage_path);
      fuente_url = pub.publicUrl || null;
    }

    const { data: biz, error: bErr } = await supabase
      .from("negocios")
      .select(
        "id,nombre,sector,detalles_negocio,regulacion_actividades_especiales,normativa_actualizar_nota,normativa_actualizar_urls"
      )
      .eq("id", negocio_id)
      .single();
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 400 });

    const contexto_rubro =
      [
        biz?.regulacion_actividades_especiales ? `Actividades reguladas: ${biz.regulacion_actividades_especiales}` : "",
        biz?.normativa_actualizar_nota ? `Normativa a actualizar (nota): ${biz.normativa_actualizar_nota}` : "",
        biz?.normativa_actualizar_urls ? `Enlaces: ${biz.normativa_actualizar_urls}` : ""
      ]
        .filter(Boolean)
        .join("\n") || null;

    const meta = await extractNormativaMetaGemini({ file_name: file.name, texto });
    const tituloDetectado = meta.titulo_detectado ?? file.name;

    const { data: inserted, error: nErr } = await supabase
      .from("normativa_docs")
      .insert({
        negocio_id,
        titulo: tituloDetectado,
        fuente_url: fuente_url,
        storage_path: storage_path,
        mime_type: file.type || "application/pdf",
        texto_extraido: texto,
        sha256,
        fecha_normativa: meta.fecha_normativa_iso,
        created_by: userData.user.id
      })
      .select("id")
      .single();
    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 400 });

    const { data: siblings } = await supabase
      .from("normativa_docs")
      .select("id,titulo,texto_extraido,sha256,fecha_normativa")
      .eq("negocio_id", negocio_id)
      .neq("id", inserted.id);

    const existentes = siblings ?? [];
    let comparacion = await compareNormativaWithGemini({
      titulo_nuevo: file.name,
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

    const res = await fetch(new URL("/api/gemini/extract", req.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        texto,
        fuente_url,
        negocio: {
          nombre: biz?.nombre ?? null,
          sector: biz?.sector ?? null,
          detalles: biz?.detalles_negocio ?? null,
          contexto_rubro: contexto_rubro
        }
      })
    });
    const data = await res.json();
    if (!res.ok) {
      // Pass-through quota errors cleanly
      if (res.status === 429 && data?.code === "GEMINI_QUOTA") {
        return NextResponse.json({ error: data.error, code: data.code, retry_after_seconds: data.retry_after_seconds }, { status: 429 });
      }
      return NextResponse.json({ error: data?.error ?? "Gemini error", raw: data?.raw }, { status: 502 });
    }

    return NextResponse.json({
      items: data.items ?? [],
      normativa_doc_id: inserted.id,
      sha256,
      comparacion,
      fuente_url,
      storage_path
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error procesando PDF" }, { status: 400 });
  }
}
