/** Misma etiqueta que el desplegable «Supervisor legal» en la matriz. */
export function formatAssignableProfileLabel(u: {
  nombre: string | null;
  email: string | null;
  id: string;
}): string {
  const left = (u.nombre || u.email || u.id).slice(0, 48);
  return u.email ? `${left} · ${u.email}` : left;
}

export type ProfileMini = { id: string; nombre: string | null; email: string | null };

/** Texto efectivo para la columna compliance: manual, o supervisor legal si sigue vacío. */
export function effectiveMatrizResponsableCompliance(
  responsable: string | null | undefined,
  supervisorLegalId: string | null | undefined,
  profileById: Map<string, ProfileMini>
): string {
  const t = (responsable ?? "").trim();
  if (t) return responsable as string;
  if (!supervisorLegalId) return "";
  const p = profileById.get(supervisorLegalId);
  return p ? formatAssignableProfileLabel(p) : "";
}
