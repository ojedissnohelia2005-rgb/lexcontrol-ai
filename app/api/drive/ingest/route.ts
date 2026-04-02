import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ingestNormativaPdf, PdfIngestError } from "@/lib/pdf-ingest";
import { downloadDriveFileForIngest, getDriveClient } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 90;

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  file_id: z.string().min(5).max(128)
});

function extractApiUrlFromReq(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}/api/gemini/extract`;
  return new URL("/api/gemini/extract", req.url).toString();
}

/**
 * Descarga un archivo desde Drive con la cuenta de servicio y lo ingiere como /api/pdfs/from-url.
 */
export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());
    const cfg = getDriveClient();
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.reason }, { status: 503 });
    }

    let meta: { id?: string | null; name?: string | null; mimeType?: string | null };
    try {
      const res = await cfg.drive.files.get({
        fileId: body.file_id,
        fields: "id,name,mimeType"
      });
      meta = res.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error de Drive";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (!meta?.id || !meta.name || !meta.mimeType) {
      return NextResponse.json({ error: "No se pudo leer metadatos del archivo en Drive" }, { status: 400 });
    }

    const { buffer, fileName } = await downloadDriveFileForIngest(
      cfg.drive,
      meta.id,
      meta.mimeType,
      meta.name
    );

    const fuenteUrl = `https://drive.google.com/file/d/${meta.id}/view`;
    const result = await ingestNormativaPdf(supabase, {
      userId: userData.user.id,
      negocioId: body.negocio_id,
      buffer,
      fileName,
      mimeType: "application/pdf",
      fuente_url_in: fuenteUrl,
      storage_path_in: null,
      extractApiUrl: extractApiUrlFromReq(req)
    });

    return NextResponse.json({ ...result, source_url: fuenteUrl, drive_file_id: meta.id });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: e.flatten() }, { status: 400 });
    }
    if (e instanceof PdfIngestError) {
      if (e.code === "GEMINI_QUOTA") {
        return NextResponse.json(
          {
            error: e.message,
            code: e.code,
            retry_after_seconds: e.extra?.retry_after_seconds
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
