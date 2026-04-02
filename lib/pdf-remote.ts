/**
 * Descarga PDFs desde URL pública. Google Drive: convierte enlaces de "ver archivo" a descarga directa.
 * Carpetas de Drive no se pueden listar sin API de Google; el usuario debe pegar enlaces de cada archivo.
 */

const MAX_BYTES = 45 * 1024 * 1024;

export function isGoogleDriveFolderUrl(url: string): boolean {
  return /drive\.google\.com\/(drive\/)?folders\//i.test(url.trim());
}

export function toDownloadableUrl(url: string): string {
  const u = url.trim();
  const fileIdFromPath = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)?.[1];
  if (fileIdFromPath) {
    return `https://drive.google.com/uc?export=download&id=${fileIdFromPath}`;
  }
  const openId = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i)?.[1];
  if (/drive\.google\.com\/open/i.test(u) && openId) {
    return `https://drive.google.com/uc?export=download&id=${openId}`;
  }
  return u;
}

export async function fetchPdfBufferFromUrl(url: string): Promise<{ buffer: Buffer; suggestedFileName: string }> {
  if (isGoogleDriveFolderUrl(url)) {
    throw new Error(
      "Este enlace es una carpeta de Drive. Abre la carpeta, comparte cada PDF (enlace) y pégalos uno por línea en AI Notebook, o sube los archivos desde tu equipo."
    );
  }

  const target = toDownloadableUrl(url);
  const res = await fetch(target, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LexControl/1.0; +pdf-ingest)"
    }
  });
  if (!res.ok) {
    throw new Error(`No se pudo descargar la URL (${res.status}). Comprueba que el enlace sea público o “cualquiera con el enlace”.`);
  }

  const len = res.headers.get("content-length");
  if (len && Number(len) > MAX_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (~45 MB).");
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (~45 MB).");
  }

  const buffer = Buffer.from(arrayBuffer);
  const head = buffer.slice(0, 5).toString("utf8");
  if (!head.startsWith("%PDF")) {
    throw new Error(
      "La respuesta no es un PDF. En Drive: archivo → compartir → “Cualquiera con el enlace” → copiar enlace del archivo (no de la carpeta)."
    );
  }

  let suggestedFileName = "documento-remoto.pdf";
  try {
    const path = new URL(target).pathname;
    const fromPath = path.split("/").pop();
    if (fromPath && fromPath.endsWith(".pdf")) suggestedFileName = decodeURIComponent(fromPath);
  } catch {
    /* ignore */
  }
  const cd = res.headers.get("content-disposition");
  const m = cd?.match(/filename\*?=(?:UTF-8'')?["']?([^";\n]+)/i);
  if (m?.[1]) {
    try {
      suggestedFileName = decodeURIComponent(m[1]!.replace(/["']/g, "").trim());
    } catch {
      suggestedFileName = m[1]!.replace(/["']/g, "").trim();
    }
  }

  return { buffer, suggestedFileName };
}

/** Estimación orientativa para la UI (segundos por PDF: red + extracción + IA). */
export const SECONDS_PER_PDF_ESTIMATE = 40;

export function estimateBatchSeconds(count: number): number {
  return Math.max(15, Math.round(count * SECONDS_PER_PDF_ESTIMATE));
}
