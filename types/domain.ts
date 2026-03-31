export type MatrizEstado = "cumplido" | "pendiente" | "no_aplica" | "en_proceso";

export type Prioridad = "critico" | "alto" | "medio" | "bajo";

export type ProfileRole = "super_admin" | "admin" | "user";

export const SUPER_ADMIN_EMAILS = new Set([
  "nohe.ojedis@cumplimientonormativo.edu.ec",
  "ortix@cumplimientonormativo.edu.ec",
  "ojedissnohelia2005@gmail.com",
  "mathias.martinez@uees.edu.ec"
]);

export type Negocio = {
  id: string;
  nombre: string;
  sector: string | null;
  puntaje_cumplimiento: number | null;
  responsable_id: string | null;
  detalles_negocio: string | null;
  regulacion_actividades_especiales?: string | null;
  normativa_actualizar_nota?: string | null;
  normativa_actualizar_urls?: string | null;
  guia_fuentes_ia?: string | null;
  created_at?: string;
};

export type ComparacionNormativa = {
  relacion: "INDEPENDIENTE" | "MISMA_NORMA" | "ACTUALIZACION";
  doc_coincidente_id: string | null;
  nueva_es_mas_reciente: boolean | null;
  confianza: number;
  razon: string;
};

export type PropuestaPendiente = {
  id: string;
  negocio_id: string;
  articulo: string;
  requisito: string;
  sancion: string | null;
  cita_textual: string | null;
  link_fuente_oficial: string | null;
  fuente_verificada_url: string | null;
  area_competente: string | null;
  gerencia_competente: string | null;
  impacto_economico: number | null;
  probabilidad_incumplimiento: number | null;
  evidencia_url: string | null;
  estado: MatrizEstado;
  extra?: Record<string, unknown> | null;
  aplica_usuario?: boolean | null;
  asignacion_gerencia?: string | null;
  asignacion_jefatura?: string | null;
  supervisor_legal_id?: string | null;
  normativa_doc_id?: string | null;
  created_at?: string;
};

