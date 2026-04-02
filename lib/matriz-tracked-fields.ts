/** Campos de matriz que se comparan al notificar ediciones y al revertir. */
export const MATRIZ_TRACKED_EDIT_FIELDS = [
  "tipo_norma",
  "norma_nombre",
  "fecha_publicacion",
  "organismo_emisor",
  "estado",
  "resumen_experto",
  "campo_juridico",
  "observaciones",
  "proceso_actividad_relacionada",
  "sponsor",
  "responsable_proceso",
  "articulo",
  "requisito",
  "sancion",
  "multa_estimada_usd",
  "responsable",
  "prioridad",
  "evidencia_url",
  "link_fuente_oficial",
  "fuente_verificada_url",
  "impacto_economico",
  "probabilidad_incumplimiento",
  "gerencia_competente",
  "area_competente"
] as const;

export type MatrizTrackedField = (typeof MATRIZ_TRACKED_EDIT_FIELDS)[number];

export const MATRIZ_TRACKED_FIELD_SET = new Set<string>(MATRIZ_TRACKED_EDIT_FIELDS);
