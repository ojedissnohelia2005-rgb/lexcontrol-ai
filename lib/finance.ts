import type { Prioridad } from "@/types/domain";

export const SBU_ECUADOR_2026_USD = 460;

export function parseSbuCount(text: string): number | null {
  const normalized = text.replace(/\./g, "").replace(/,/g, ".");
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:sbu|salarios?\s*b[aá]sicos?|salario\s*b[aá]sico\s*unificado)/i,
    /(?:sbu|salarios?\s*b[aá]sicos?|salario\s*b[aá]sico\s*unificado)\s*(?:de)?\s*(\d+(?:\.\d+)?)/i
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m?.[1]) return Number(m[1]);
  }
  return null;
}

function parseUsdAmountFromText(text: string): number | null {
  const t = text.replace(/\s/g, " ");
  const patterns: RegExp[] = [
    /\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d+)?)/i,
    /USD\s*\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+)/i,
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*USD\b/i,
    /(?:multa|sanci[oó]n|pena)\s+(?:de|hasta|por)?\s*\$?\s*(\d{1,3}(?:[.,]\d{3})*|\d+)/i,
    /(?:de|hasta)\s+\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(?:d[oó]lares|USD)?/i
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    let raw = m[1].replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw)) {
      raw = raw.replace(/,/g, "");
    } else {
      raw = raw.replace(/,/g, ".");
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n < 1e10) return Math.round(n * 100) / 100;
  }
  return null;
}

/**
 * Orden de magnitud conservador cuando la sanción es cualitativa (p. ej. solo responsabilidad / fraude tributario).
 * Sirve para priorización y línea "Sug." en UI, no como cuantía legal exacta.
 */
function heuristicMultaFromQualitativeSancion(sancion: string): number | null {
  const s = sancion.toLowerCase();
  if (/clausura|suspensi[oó]n\s+de\s+actividades|caducidad/i.test(s)) return 25_000;
  if (/c[aá]rcel|privaci[oó]n\s+de\s+la\s+libertad|recluso/i.test(s)) return 15_000;
  if (/dolo|culpa\s+grave|fraude\s+tributar|evasi[oó]n|lavado/i.test(s)) return 8_000;
  if (/responsabilidad\s+solidaria|multa|sanci[oó]n|infracci[oó]n/i.test(s)) return 3_000;
  return null;
}

export function estimateUsdFromSanction(sancion: string | null | undefined): number | null {
  if (!sancion) return null;
  const sbu = parseSbuCount(sancion);
  if (typeof sbu === "number" && Number.isFinite(sbu)) {
    return Math.round(sbu * SBU_ECUADOR_2026_USD * 100) / 100;
  }
  const normalized = sancion.replace(/\s/g, " ");
  const usd = normalized.match(/\$\s*(\d+(?:[.,]\d+)?)/);
  if (usd?.[1]) return Number(usd[1].replace(/,/g, ""));
  const parsed = parseUsdAmountFromText(sancion);
  if (parsed != null) return parsed;
  return heuristicMultaFromQualitativeSancion(sancion);
}

export function computePriorityScore(
  impacto_economico: number | null | undefined,
  probabilidad_incumplimiento: number | null | undefined
) {
  const i = typeof impacto_economico === "number" ? impacto_economico : 0;
  const p = typeof probabilidad_incumplimiento === "number" ? probabilidad_incumplimiento : 0;
  return i * p;
}

export function classifyPrioridad(opts: {
  sancion?: string | null;
  multa_estimada_usd?: number | null;
  priorityScore?: number | null;
}): Prioridad {
  const sancion = opts.sancion ?? "";
  const multa = opts.multa_estimada_usd ?? estimateUsdFromSanction(sancion) ?? 0;
  const score = opts.priorityScore ?? 0;

  const hasClausura = /clausura|suspensi[oó]n\s+de\s+actividades/i.test(sancion);
  if (hasClausura || multa > 5000) return "critico";
  if (multa > 1500 || score >= 30) return "alto";
  if (multa > 500 || score >= 12) return "medio";
  return "bajo";
}

