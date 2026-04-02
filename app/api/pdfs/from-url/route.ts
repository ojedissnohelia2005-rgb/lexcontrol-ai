import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ingestNormativaPdf, PdfIngestError } from "@/lib/pdf-ingest";
import { fetchPdfBufferFromUrl } from "@/lib/pdf-remote";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  url: z.string().url()
});

function extractApiUrlFromReq(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}/api/gemini/extract`;
  return new URL("/api/gemini/extract", req.url).toString();
}

/**
 * Descarga un PDF público (URL directa o enlace de archivo de Google Drive) y lo procesa como /api/pdfs/process.
 */
export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const { buffer, suggestedFileName } = await fetchPdfBufferFromUrl(body.url);

    const result = await ingestNormativaPdf(supabase, {
      userId: userData.user.id,
      negocioId: body.negocio_id,
      buffer,
      fileName: suggestedFileName,
      mimeType: "application/pdf",
      fuente_url_in: body.url.trim(),
      storage_path_in: null,
      extractApiUrl: extractApiUrlFromReq(req)
    });

    return NextResponse.json({ ...result, source_url: body.url.trim() });
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
