import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDriveClient, getNormativaFolderId, listFolderFilesForIngest } from "@/lib/google-drive";

export const runtime = "nodejs";

/**
 * Lista PDFs y Google Docs en una carpeta de Drive (solo lectura, cuenta de servicio).
 * Query: folder_id opcional (por defecto GOOGLE_DRIVE_NORMATIVA_FOLDER_ID o carpeta legal del proyecto).
 */
export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const paramFolder = searchParams.get("folder_id")?.trim();
  const folderId = paramFolder || getNormativaFolderId();

  const cfg = getDriveClient();
  if (!cfg.ok) {
    return NextResponse.json({
      configured: false,
      service_account_email: cfg.clientEmail,
      hint: cfg.reason,
      folder_id: folderId,
      files: [] as unknown[]
    });
  }

  try {
    const files = await listFolderFilesForIngest(cfg.drive, folderId);
    return NextResponse.json({
      configured: true,
      service_account_email: cfg.clientEmail,
      folder_id: folderId,
      files
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error al listar Drive";
    return NextResponse.json(
      {
        configured: true,
        service_account_email: cfg.clientEmail,
        folder_id: folderId,
        error: msg,
        files: []
      },
      { status: 400 }
    );
  }
}
