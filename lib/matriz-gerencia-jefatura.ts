/**
 * En matriz/propuestas, gerencia_competente y sponsor son el mismo dato;
 * area_competente y responsable_proceso también. Se mantienen ambos pares
 * en BD por compatibilidad con exportaciones y datos antiguos.
 */
export function normalizeOrganizacion4(
  p: Partial<{
    sponsor: string | null | undefined;
    responsable_proceso: string | null | undefined;
    gerencia_competente: string | null | undefined;
    area_competente: string | null | undefined;
  }>
): {
  gerencia_competente: string | null;
  sponsor: string | null;
  area_competente: string | null;
  responsable_proceso: string | null;
} {
  const ger = (p.gerencia_competente ?? p.sponsor)?.trim() || null;
  const jef = (p.area_competente ?? p.responsable_proceso)?.trim() || null;
  return {
    gerencia_competente: ger,
    sponsor: ger,
    area_competente: jef,
    responsable_proceso: jef
  };
}

export function displayGerenciaMatriz(row: {
  gerencia_competente?: string | null;
  sponsor?: string | null;
}): string {
  return (row.gerencia_competente ?? row.sponsor)?.trim() ?? "";
}

export function displayJefaturaMatriz(row: {
  area_competente?: string | null;
  responsable_proceso?: string | null;
}): string {
  return (row.area_competente ?? row.responsable_proceso)?.trim() ?? "";
}

export function patchGerenciaUnificada(raw: string): {
  gerencia_competente: string | null;
  sponsor: string | null;
} {
  const v = raw.trim() || null;
  return { gerencia_competente: v, sponsor: v };
}

export function patchJefaturaUnificada(raw: string): {
  area_competente: string | null;
  responsable_proceso: string | null;
} {
  const v = raw.trim() || null;
  return { area_competente: v, responsable_proceso: v };
}

/** Prioriza asignación manual del triage, luego campos de la propuesta/IA. */
export function organizacionParaAprobarPropuesta(p: {
  asignacion_gerencia?: string | null;
  asignacion_jefatura?: string | null;
  gerencia_competente?: string | null;
  area_competente?: string | null;
  sponsor?: string | null;
  responsable_proceso?: string | null;
}) {
  const gUser = p.asignacion_gerencia?.trim() || "";
  const jUser = p.asignacion_jefatura?.trim() || "";
  const base = normalizeOrganizacion4(p);
  return normalizeOrganizacion4({
    gerencia_competente: gUser || base.gerencia_competente,
    area_competente: jUser || base.area_competente
  });
}
