import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  documento_reemplazar_id: z.string().uuid(),
  nuevo_documento_id: z.string().uuid()
});

/**
 * Tras autorización humana: copia contenido del doc nuevo sobre el registro antiguo y elimina el duplicado.
 * La “versión en drive” del producto = Supabase Storage + fila normativa_docs (no OAuth Google Drive).
 */
export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const { data: nuevo, error: nErr } = await supabase
      .from("normativa_docs")
      .select("id,negocio_id,titulo,fuente_url,storage_path,mime_type,sha256,texto_extraido,fecha_normativa,fingerprint_norma")
      .eq("id", body.nuevo_documento_id)
      .single();
    if (nErr || !nuevo) return NextResponse.json({ error: "Documento nuevo no encontrado" }, { status: 400 });

    const { data: viejo, error: vErr } = await supabase
      .from("normativa_docs")
      .select("id,negocio_id")
      .eq("id", body.documento_reemplazar_id)
      .single();
    if (vErr || !viejo) return NextResponse.json({ error: "Documento a reemplazar no encontrado" }, { status: 400 });

    const nn = nuevo.negocio_id as string | null;
    const vn = viejo.negocio_id as string | null;
    if (nn !== vn) {
      return NextResponse.json(
        { error: "Los documentos deben estar en el mismo ámbito (biblioteca global o el mismo negocio)" },
        { status: 400 }
      );
    }
    if (nn !== null && nn !== body.negocio_id) {
      return NextResponse.json({ error: "Los documentos deben pertenecer al negocio indicado" }, { status: 400 });
    }

    const { error: uErr } = await supabase
      .from("normativa_docs")
      .update({
        titulo: nuevo.titulo,
        fuente_url: nuevo.fuente_url,
        storage_path: nuevo.storage_path,
        mime_type: nuevo.mime_type,
        sha256: nuevo.sha256,
        texto_extraido: nuevo.texto_extraido,
        fecha_normativa: nuevo.fecha_normativa,
        fingerprint_norma: nuevo.fingerprint_norma
      })
      .eq("id", viejo.id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    await supabase
      .from("propuestas_pendientes")
      .update({ normativa_doc_id: viejo.id })
      .eq("normativa_doc_id", nuevo.id);

    const { error: dErr } = await supabase.from("normativa_docs").delete().eq("id", nuevo.id);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "NORMATIVA_REEMPLAZO_AUTORIZADO",
      tabla: "normativa_docs",
      registro_id: viejo.id,
      valor_nuevo: { reemplazado_por_flujo: nuevo.id }
    });

    return NextResponse.json({ ok: true, normativa_doc_id: viejo.id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
