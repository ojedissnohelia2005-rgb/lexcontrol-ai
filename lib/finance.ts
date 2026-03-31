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

export function estimateUsdFromSanction(sancion: string | null | undefined): number | null {
  if (!sancion) return null;
  const sbu = parseSbuCount(sancion);
  if (typeof sbu === "number" && Number.isFinite(sbu)) {
    return Math.round(sbu * SBU_ECUADOR_2026_USD * 100) / 100;
  }
  const normalized = sancion.replace(/\s/g, " ");
  const usd = normalized.match(/\$\s*(\d+(?:[.,]\d+)?)/);
  if (usd?.[1]) return Number(usd[1].replace(/,/g, ""));
  return null;
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

