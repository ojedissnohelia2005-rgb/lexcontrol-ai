/** Agrupa ítems de extracción: mismo obligacion_grupo_id → un bloque; sin id → uno por posición. */
export function groupByObligacionGrupo<T extends { obligacion_grupo_id?: string | null }>(
  items: T[]
): { key: string; list: T[] }[] {
  const map = new Map<string, T[]>();
  items.forEach((it, i) => {
    const gid = typeof it.obligacion_grupo_id === "string" ? it.obligacion_grupo_id.trim() : "";
    const key = gid ? `g:${gid}` : `i:${i}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  });
  return Array.from(map.entries()).map(([key, list]) => ({
    key,
    list: [...list].sort((a, b) =>
      String((a as { articulo?: string }).articulo ?? "").localeCompare(
        String((b as { articulo?: string }).articulo ?? ""),
        "es",
        { numeric: true }
      )
    )
  }));
}

export type WithObligacionGrupoFields = {
  obligacion_grupo_id?: string | null;
  obligacion_resumen_consolidado?: string | null;
};

/** Copia el mismo resumen consolidado a todo el grupo cuando la IA lo puso solo en un ítem. */
export function propagateObligacionResumenConsolidado<T extends WithObligacionGrupoFields>(items: T[]): void {
  const byId = new Map<string, T[]>();
  for (const it of items) {
    const g = it.obligacion_grupo_id?.trim();
    if (!g) continue;
    if (!byId.has(g)) byId.set(g, []);
    byId.get(g)!.push(it);
  }
  for (const [, group] of byId) {
    if (group.length < 2) continue;
    const text =
      group
        .map((x) => x.obligacion_resumen_consolidado?.trim())
        .find((s) => s && s.length >= 20) ?? null;
    if (text) {
      for (const it of group) it.obligacion_resumen_consolidado = text;
    }
  }
}
