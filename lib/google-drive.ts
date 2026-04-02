import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import {
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL_DEFAULT,
  LEGAL_DRIVE_FOLDER_ID
} from "@/lib/legal-constants";

export type DriveClientResult =
  | { ok: true; drive: drive_v3.Drive; clientEmail: string }
  | { ok: false; reason: string; clientEmail: string };

export function getNormativaFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_NORMATIVA_FOLDER_ID?.trim() || LEGAL_DRIVE_FOLDER_ID;
  return id;
}

export function getDriveServiceAccountEmail(): string {
  return (
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim() || GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL_DEFAULT
  );
}

export function getDriveClient(): DriveClientResult {
  const clientEmail = getDriveServiceAccountEmail();
  const raw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!raw?.trim()) {
    return {
      ok: false,
      clientEmail,
      reason:
        "Falta GOOGLE_DRIVE_PRIVATE_KEY en el servidor (.env.local o variables de Vercel). Pega la clave privada del JSON de la cuenta de servicio (con \\n como saltos de línea)."
    };
  }
  const privateKey = raw.replace(/\\n/g, "\n");
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    return {
      ok: false,
      clientEmail,
      reason: "GOOGLE_DRIVE_PRIVATE_KEY no parece una clave PEM (falta BEGIN PRIVATE KEY)."
    };
  }
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"]
  });
  return { ok: true, drive: google.drive({ version: "v3", auth }), clientEmail };
}

export type DriveListFile = {
  id: string;
  name: string;
  mimeType: string | null;
  modifiedTime: string | null;
};

const INGEST_MIMES = new Set([
  "application/pdf",
  "application/vnd.google-apps.document"
]);

function assertSafeFolderId(folderId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(folderId)) {
    throw new Error("folder_id inválido");
  }
}

export async function listFolderFilesForIngest(
  drive: drive_v3.Drive,
  folderId: string
): Promise<DriveListFile[]> {
  assertSafeFolderId(folderId);
  const q = `'${folderId}' in parents and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: "files(id,name,mimeType,modifiedTime)",
    pageSize: 100,
    orderBy: "folder,name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  const files = res.data.files ?? [];
  return files
    .filter((f): f is typeof f & { id: string; name: string } => Boolean(f.id && f.name))
    .filter((f) => Boolean(f.mimeType && INGEST_MIMES.has(f.mimeType)))
    .map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType ?? null,
      modifiedTime: f.modifiedTime ?? null
    }));
}

export async function downloadDriveFileForIngest(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
  displayName: string
): Promise<{ buffer: Buffer; fileName: string }> {
  if (mimeType === "application/pdf") {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    const data = res.data as ArrayBuffer;
    const buf = Buffer.from(data);
    const name = displayName.toLowerCase().endsWith(".pdf")
      ? displayName
      : `${displayName.replace(/\.[^/.]+$/, "") || "normativa"}.pdf`;
    return { buffer: buf, fileName: name };
  }
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );
    const data = res.data as ArrayBuffer;
    const base = displayName.replace(/\.[^/.]+$/, "") || "documento";
    return { buffer: Buffer.from(data), fileName: `${base}.pdf` };
  }
  throw new Error(`Tipo no soportado para importar: ${mimeType}`);
}
