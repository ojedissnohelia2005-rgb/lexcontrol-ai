/**
 * La IA a veces devuelve texto ("Alto, debido a sanciones…") en campos que en BD son integer.
 * Convierte a escala esperada o null.
 */

export function coerceImpactoEconomico(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n >= 1 && n <= 10) return n;
    return null;
  }
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (!t) return null;
    const m = t.match(/\b(10|[1-9])\b/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 10) return n;
    }
    const nDot = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(nDot)) {
      const n = Math.round(nDot);
      if (n >= 1 && n <= 10) return n;
    }
    if (/muy\s*alt|cr[ií]tic|sever|m[aá]xim/.test(t)) return 9;
    if (t.startsWith("alto") || /^alt[aá]\b|^elev|considerable/.test(t)) return 7;
    if (/medi/.test(t)) return 5;
    if (/\bbaj[a]?\b/.test(t) && !/bajo\s+el\b/.test(t)) return 3;
    if (/muy\s*baj|m[ií]nim|insignific/.test(t)) return 2;
  }
  return null;
}

export function coerceProbabilidadIncumplimiento(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n >= 1 && n <= 5) return n;
    return null;
  }
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (!t) return null;
    const m = t.match(/\b([1-5])\b/);
    if (m) return parseInt(m[1], 10);
    const nDot = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(nDot)) {
      const n = Math.round(nDot);
      if (n >= 1 && n <= 5) return n;
    }
    if (/muy\s*alt|cr[ií]tic|much[ií]sima|casi\s*segur/.test(t)) return 5;
    if (t.startsWith("alto") || /^alt[aá]\b|^elev|probable/.test(t)) return 4;
    if (/medi/.test(t)) return 3;
    if (/\bbaj[a]?\b/.test(t)) return 2;
    if (/muy\s*baj|remot|improb|rar[oa]/.test(t)) return 1;
  }
  return null;
}
