import { createPrivateKey } from "crypto";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import {
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL_DEFAULT,
  LEGAL_DRIVE_FOLDER_ID
} from "@/lib/legal-constants";

/**
 * Normaliza GOOGLE_DRIVE_PRIVATE_KEY para Node/OpenSSL 3:
 * comillas envolventes, \n literales, CRLF, PEM en una sola línea, BOM.
 */
function normalizeGoogleServiceAccountPrivateKey(raw: string): string {
  let s = raw.trim().replace(/^\uFEFF/, "");
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("\u201c") && s.endsWith("\u201d")) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
    if (s === before) break;
  }

  const pkcs8Block =
    /-----BEGIN PRIVATE KEY-----\s*([\s\S]*?)\s*-----END PRIVATE KEY-----/;
  const rsaBlock = /-----BEGIN RSA PRIVATE KEY-----\s*([\s\S]*?)\s*-----END RSA PRIVATE KEY-----/;
  const m8 = s.match(pkcs8Block);
  const mr = s.match(rsaBlock);
  if (m8) {
    const body = m8[1].replace(/\s+/g, "");
    if (body.length > 0) {
      const lines = body.match(/.{1,64}/g) ?? [body];
      s = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
    }
  } else if (mr) {
    const body = mr[1].replace(/\s+/g, "");
    if (body.length > 0) {
      const lines = body.match(/.{1,64}/g) ?? [body];
      s = `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`;
    }
  }

  const t = s.trim();
  return t.endsWith("\n") ? t : `${t}\n`;
}

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
  const privateKey = normalizeGoogleServiceAccountPrivateKey(raw);
  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    return {
      ok: false,
      clientEmail,
      reason: "GOOGLE_DRIVE_PRIVATE_KEY no parece una clave PEM (falta BEGIN … PRIVATE KEY)."
    };
  }
  try {
    createPrivateKey({ key: privateKey, format: "pem" });
  } catch (e: unknown) {
    const hint = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      clientEmail,
      reason: `La clave PEM no es válida para OpenSSL (${hint}). En .env usa comillas y \\n entre líneas, o pega el bloque multilínea tal cual del JSON de Google.`
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
