/**
 * Filtro de seguridad cuando la IA marca aplica=true pero el texto es claramente
 * de otro sujeto obligado (p. ej. COIP penitenciario vs empresa privada genérica).
 */

export type PerfilNegocioExtract = {
  nombre?: string | null;
  sector?: string | null;
  detalles?: string | null;
  contexto_rubro?: string | null;
};

const PENITENCIARIO_PPL = new RegExp(
  [
    "privad[ao]s?\\s+de\\s+libertad",
    "personas?\\s+privadas?\\s+de\\s+libertad",
    "hacinamiento",
    "trato\\s+humanitario.*privad",
    "centros?\\s+de\\s+privaci",
    "sistema\\s+penitenciario",
    "penitenci",
    "reclusor",
    "\\bppl\\b",
    "poblaci[oó]n\\s+privada\\s+de\\s+libertad",
    "custodia\\s+penal\\s+en\\s+centros"
  ].join("|"),
  "i"
);

/** COIP u otra norma penal: sí aplica a empresas privadas cuando toca penal económico o PJ (no penitenciario). */
const PENAL_ECONOMICO_O_PERSONA_JURIDICA = new RegExp(
  [
    "persona\\s+jur[ií]dica",
    "responsabilidad\\s+penal\\s+de\\s+la\\s+persona\\s+jur[ií]dica",
    "responsabilidad\\s+penal\\s+de\\s+las\\s+personas\\s+jur[ií]dicas",
    "sociedad\\s+.*\\s+responsabilidad\\s+penal",
    "representante\\s+legal.*(?:dolo|culpa\\s+grave|fraude|lavado)",
    "administrador(?:es)?\\s+.*(?:dolo|culpa|fraude)",
    "delitos?\\s+.*econ[oó]mic",
    "penal\\s+econ[oó]mic",
    "lavado\\s+de\\s+activos",
    "cohecho|corrupci[oó]n\\s+privada|defraudaci[oó]n",
    "estafa|falsedad\\s+en\\s+documento\\s+mercantil"
  ].join("|"),
  "i"
);

const BANCA_EXCLUSIVO = new RegExp(
  [
    "junta\\s+de\\s+pol[ií]tica\\s+y\\s+regulaci[oó]n\\s+financiera",
    "comit[eé]\\s+de\\s+auditor[ií]a.*(financier|bancar|entidad)",
    "entidades?\\s+del\\s+sistema\\s+financiero\\s+ecuatoriano",
    "superintendenc.*bancos?\\s+y\\s+seguros"
  ].join("|"),
  "i"
);

function perfilTexto(p: PerfilNegocioExtract): string {
  return [p.nombre, p.sector, p.detalles, p.contexto_rubro].filter(Boolean).join(" ").toLowerCase();
}

/** El negocio declara actividad penitenciaria / custodia / poder público en ese ámbito */
function perfilEsPenitenciarioOPublicoPenal(p: PerfilNegocioExtract): boolean {
  const t = perfilTexto(p);
  if (!t.trim()) return false;
  return (
    /penitenci|reclusor|privaci[oó]n\s+de\s+libertad|sna[ií]|servicio\s+nacional\s+de\s+atenci[oó]n|ministerio.*justicia|poder\s+judicial|fiscal[ií]a\s+general|gobernaci[oó]n|municipio|alcald[ií]a|concejo|empresa\s+p[uú]blica|eps\s+penal/i.test(
      t
    ) || /centro\s+de\s+rehabilitaci[oó]n\s+social|crs\b/i.test(t)
  );
}

function perfilEsFinancieroSupervisado(p: PerfilNegocioExtract): boolean {
  const t = perfilTexto(p);
  return /banco|financier|cooperativa\s+de\s+ahorro|seguros?\s+y\s+reafian|microfinanz|sistema\s+financier|stock\s+burs/i.test(t);
}

function blobItem(it: {
  requisito?: string;
  cita_textual?: string | null;
  sancion?: string | null;
  resumen_experto?: string | null;
  articulo?: string;
}): string {
  return [it.requisito, it.cita_textual, it.sancion, it.resumen_experto, it.articulo].filter(Boolean).join("\n");
}

/**
 * true = descartar el ítem (no competente para el perfil).
 */
export function itemDebeDescartarsePorHeuristica(
  it: {
    requisito?: string;
    cita_textual?: string | null;
    sancion?: string | null;
    resumen_experto?: string | null;
    articulo?: string;
  },
  perfil: PerfilNegocioExtract
): boolean {
  const blob = blobItem(it);
  if (!blob.trim()) return false;

  if (PENITENCIARIO_PPL.test(blob) && !perfilEsPenitenciarioOPublicoPenal(perfil)) {
    if (PENAL_ECONOMICO_O_PERSONA_JURIDICA.test(blob)) return false;
    return true;
  }
  if (BANCA_EXCLUSIVO.test(blob) && !perfilEsFinancieroSupervisado(perfil)) {
    return true;
  }
  return false;
}
