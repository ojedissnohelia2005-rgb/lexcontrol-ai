/** Normaliza título para detectar duplicados (misma norma subida dos veces). */
export function normalizeNormativaTitle(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function labelClasificacionDoc(v: string | null | undefined): string {
  if (!v) return "";
  const x = v.toLowerCase();
  if (x === "ley") return "Ley";
  if (x === "reglamento") return "Reglamento";
  if (x === "decreto") return "Decreto";
  if (x === "resolucion" || x === "resolución") return "Resolución";
  if (x === "otro") return "Otro";
  return v;
}
