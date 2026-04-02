import { generateAiText } from "@/lib/ai";
import type { GeminiExtractionItem } from "@/app/api/gemini/extract/route";
import type { ComparacionNormativa } from "@/types/domain";

export type { ComparacionNormativa };

const sample = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max));

function isQuotaErrorMessage(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("429") || m.includes("quota") || m.includes("too many requests");
}

function parseRetrySeconds(msg: string): number | null {
  const m = msg.match(/retry in ([0-9.]+)s/i)?.[1];
  if (!m) return null;
  const n = Number(m);
  return Number.isFinite(n) ? Math.ceil(n) : null;
}

function buildDocsBlock(
  documentos: { id: string; titulo: string | null; texto: string }[],
  opts?: { perDocMax?: number; totalMax?: number }
) {
  const perDocMax = opts?.perDocMax ?? 12_000;
  const totalMax = opts?.totalMax ?? 45_000;
  let out = "";
  for (let i = 0; i < documentos.length; i++) {
    const d = documentos[i]!;
    const chunk = `### DOC ${i + 1} id=${d.id} titulo=${d.titulo ?? "—"}\n${sample(d.texto, perDocMax)}\n\n`;
    if (out.length + chunk.length > totalMax) break;
    out += chunk;
  }
  return out.trim();
}

function normalizeGeminiJson(text: string) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch?.[0] ?? null;
}

export type NormativaMeta = {
  titulo_detectado: string | null;
  fecha_normativa_iso: string | null; // YYYY-MM-DD
  /** ley | reglamento | decreto | resolucion | otro */
  clasificacion_documento: string | null;
  razon: string;
  confianza: number; // 0-1
};

export async function extractNormativaMetaGemini(input: { file_name: string; texto: string }): Promise<NormativaMeta> {
  const primeraPagina = sample(input.texto, 5_500);
  const prompt = [
    "Eres analista legal Ecuador 2026.",
    "El bloque de texto siguiente corresponde al INICIO del PDF (aprox. primera página).",
    "Tu tarea: identificar el TÍTULO OFICIAL de la norma tal como aparece impreso en portada o primera página (no inventes otro nombre).",
    "Si hay subtítulo o número de reglamento/resolución visible arriba, incorpóralo al título cuando forme parte del encabezado oficial.",
    "Detecta también, si existe en esa zona, la fecha de expedición o publicación.",
    "Responde SOLO JSON con la forma:",
    '{"titulo_detectado":string|null,"fecha_normativa_iso":"YYYY-MM-DD"|null,"clasificacion_documento":"ley"|"reglamento"|"decreto"|"resolucion"|"otro"|null,"razon":"breve","confianza":0-1}',
    "Reglas:",
    "- titulo_detectado: copia el título como en el documento (sin markdown). Prioridad absoluta: primera página. El file_name solo es pista si el título no se lee.",
    "- clasificacion_documento: ley (código/ley orgánica), reglamento, decreto ejecutivo, resolución/ministerial, u otro.",
    "- fecha_normativa_iso: solo si se identifica claramente; si no, null.",
    "",
    `file_name=${input.file_name}`,
    "TEXTO (primera página aprox.):",
    primeraPagina
  ].join("\n");

  let text = "";
  try {
    text = await generateAiText(prompt);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isQuotaErrorMessage(msg)) {
      const retry = parseRetrySeconds(msg);
      return {
        titulo_detectado: null,
        fecha_normativa_iso: null,
        clasificacion_documento: null,
        razon: `Sin cuota IA (reintentar en ${retry ?? 60}s).`,
        confianza: 0
      };
    }
    return {
      titulo_detectado: null,
      fecha_normativa_iso: null,
      clasificacion_documento: null,
      razon: "Error consultando IA",
      confianza: 0
    };
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    return { titulo_detectado: null, fecha_normativa_iso: null, clasificacion_documento: null, razon: "Sin JSON", confianza: 0 };
  try {
    const p = JSON.parse(jsonMatch[0]) as Partial<NormativaMeta>;
    const t = typeof p.titulo_detectado === "string" ? p.titulo_detectado.trim() : null;
    const f = typeof p.fecha_normativa_iso === "string" ? p.fecha_normativa_iso.trim() : null;
    const allowed = new Set(["ley", "reglamento", "decreto", "resolucion", "otro"]);
    const cRaw = typeof p.clasificacion_documento === "string" ? p.clasificacion_documento.trim().toLowerCase() : null;
    const c =
      cRaw === "resolución"
        ? "resolucion"
        : cRaw && allowed.has(cRaw)
          ? cRaw
          : null;
    return {
      titulo_detectado: t && t.length >= 6 ? t : null,
      fecha_normativa_iso: f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null,
      clasificacion_documento: c,
      razon: typeof p.razon === "string" ? p.razon : "",
      confianza: typeof p.confianza === "number" ? p.confianza : 0
    };
  } catch {
    return { titulo_detectado: null, fecha_normativa_iso: null, clasificacion_documento: null, razon: "Error parseando", confianza: 0 };
  }
}

export async function compareNormativaWithGemini(input: {
  titulo_nuevo: string;
  texto_nuevo: string;
  sha256_nuevo: string;
  existentes: { id: string; titulo: string | null; texto_extraido: string | null; fecha_normativa: string | null }[];
}): Promise<ComparacionNormativa> {
  if (input.existentes.length === 0) {
    return {
      relacion: "INDEPENDIENTE",
      doc_coincidente_id: null,
      nueva_es_mas_reciente: null,
      confianza: 1,
      razon: "No hay normativa previa en este negocio."
    };
  }

  const lista = input.existentes
    .map(
      (e, i) =>
        `[${i + 1}] id=${e.id} | titulo=${e.titulo ?? "—"} | fecha_normativa=${e.fecha_normativa ?? "desconocida"} | extracto=${sample(e.texto_extraido ?? "", 4000)}`
    )
    .join("\n");

  const prompt = [
    "Eres jurista EC 2026. Comparas un documento normativo NUEVO con versiones ya cargadas en sistema.",
    "Responde SOLO JSON:",
    '{"relacion":"INDEPENDIENTE"|"MISMA_NORMA"|"ACTUALIZACION","doc_coincidente_id":string|null,"nueva_es_mas_reciente":boolean|null,"confianza":0-1,"razon":"breve"}',
    "INDEPENDIENTE: normas distintas. MISMA_NORMA: mismo título/reglamento esencialmente (duplicado o reforma menor). ACTUALIZACION: reemplaza/deroga/actualiza explícitamente una existente.",
    "doc_coincidente_id debe ser exactamente el id del bloque entre corchetes si aplica; si no, null.",
    "nueva_es_mas_reciente: true si por fechas o metadatos el NUEVO es posterior; false si el existente es más reciente; null si no claro.",
    "",
    `NUEVO titulo=${input.titulo_nuevo} sha256=${input.sha256_nuevo}`,
    `NUEVO extracto=${sample(input.texto_nuevo, 12000)}`,
    "",
    "CARGADOS PREVIOS:",
    lista
  ].join("\n");

  let text = "";
  try {
    text = await generateAiText(prompt);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isQuotaErrorMessage(msg)) {
      const retry = parseRetrySeconds(msg);
      return {
        relacion: "INDEPENDIENTE",
        doc_coincidente_id: null,
        nueva_es_mas_reciente: null,
        confianza: 0,
        razon: `Sin cuota IA para comparar (reintentar en ${retry ?? 60}s).`
      };
    }
    return {
      relacion: "INDEPENDIENTE",
      doc_coincidente_id: null,
      nueva_es_mas_reciente: null,
      confianza: 0,
      razon: "No se pudo analizar comparación automática."
    };
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      relacion: "INDEPENDIENTE",
      doc_coincidente_id: null,
      nueva_es_mas_reciente: null,
      confianza: 0,
      razon: "No se pudo analizar comparación automática."
    };
  }

  try {
    const p = JSON.parse(jsonMatch[0]) as ComparacionNormativa;
    const rel = p.relacion ?? "INDEPENDIENTE";
    const relacion =
      rel === "MISMA_NORMA" || rel === "ACTUALIZACION" || rel === "INDEPENDIENTE" ? rel : "INDEPENDIENTE";
    return {
      relacion,
      doc_coincidente_id: typeof p.doc_coincidente_id === "string" ? p.doc_coincidente_id : null,
      nueva_es_mas_reciente: typeof p.nueva_es_mas_reciente === "boolean" ? p.nueva_es_mas_reciente : null,
      confianza: typeof p.confianza === "number" ? p.confianza : 0,
      razon: typeof p.razon === "string" ? p.razon : ""
    };
  } catch {
    return {
      relacion: "INDEPENDIENTE",
      doc_coincidente_id: null,
      nueva_es_mas_reciente: null,
      confianza: 0,
      razon: "Error parseando comparación."
    };
  }
}

export type DocAplicacion = { doc_id: string; aplica: boolean; motivo: string };

export async function mapNegocioNormativaGemini(input: {
  negocio: {
    nombre: string | null;
    sector: string | null;
    detalles: string | null;
    regulacion: string | null;
    nota: string | null;
    urls: string | null;
  };
  documentos: { id: string; titulo: string | null; texto: string }[];
}): Promise<{ docs: DocAplicacion[]; items: GeminiExtractionItem[] }> {
  const docsBlock = buildDocsBlock(input.documentos, { perDocMax: 12_000, totalMax: 45_000 });
  if (!docsBlock) {
    throw new Error("MAPA_NORMATIVA_SIN_TEXTO: Los documentos no tienen texto suficiente para analizar.");
  }

  const prompt = [
    "Eres analista de cumplimiento Ecuador 2026.",
    "Los documentos provienen de una BIBLIOTECA NORMATIVA COMPARTIDA (no están dedicados a un solo negocio).",
    "0) A partir del bloque NEGOCIO, infiere en qué consiste la actividad (ej. empresa privada con trabajadores que comercializa GLP → dominios probables: laboral, tributario, comercio, seguridad/prevención, normativa sectorial si el texto la trata). Esa inferencia guía qué fragmentos del PDF son útiles para ítems de matriz.",
    "1) Para cada documento (por id), decide con rigor si APLICA al negocio descrito (sector, actividades, detalles) o no; motivo breve.",
    "   Regla de competencia: (a) Penitenciario/PPL/hacinamiento/cárceles o exclusivo sistema financiero supervisado → NO aplica a empresa privada genérica; aplica=false y no extraigas de ese ámbito. (b) COIP / penal **económico**, **persona jurídica**, **responsabilidad de administradores o representantes** en delitos societarios → SÍ puede aplicar a empresas privadas; extrae ítems pertinentes.",
    "2) Solo para los que apliquen (o fragmentos relevantes), extrae items de matriz de cumplimiento como en extracción legal.",
    "   gerencia_competente y area_competente: áreas corporativas plausibles para el negocio; no inventes «Gerencia de Derecho Penal» si la empresa no es del sector justicia/Estado.",
    "",
    "Salida SOLO JSON:",
    '{"docs":[{"doc_id":"uuid","aplica":true|false,"motivo":"..."}],"items":[{"articulo","requisito","sancion","cita_textual","link_fuente_oficial","fuente_verificada_url","area_competente","gerencia_competente","impacto_economico","probabilidad_incumplimiento","tipo_norma","norma_nombre","fecha_publicacion","organismo_emisor","resumen_experto","campo_juridico","observaciones","proceso_actividad_relacionada","sponsor","responsable_proceso","obligacion_grupo_id","obligacion_grupo_etiqueta","obligacion_resumen_consolidado"}]}',
    "items: solo requisitos accionables derivados de los docs que aplican; articulo puede ser Art. X o —.",
    "obligacion_grupo_id: slug sin espacios; mismo id para artículos que materialicen UNA misma obligación sustantiva (ej. plazo + forma de pago tributario).",
    "obligacion_grupo_etiqueta: frase en español (ej. Cumplimiento de obligaciones tributarias — plazos y medios de pago).",
    "obligacion_resumen_consolidado: si hay grupo, un párrafo único que unifique el deber (ej. empieza con «La obligación consiste en…»); mismo texto en todos los ítems del grupo; requisito/cita_textual siguen siendo específicos por artículo.",
    "sponsor y gerencia_competente: mismo texto; responsable_proceso y area_competente: mismo texto (gerencia vs jefatura/área).",
    "Devuelve minimo: docs (uno por cada DOC incluido) e items (puede ser []).",
    "Si un DOC no aplica: aplica=false y NO generes items de ese DOC.",
    "",
    `NEGOCIO nombre=${input.negocio.nombre ?? "—"} sector=${input.negocio.sector ?? "—"}`,
    `detalles=${input.negocio.detalles ?? "—"}`,
    `regulacion_especial=${input.negocio.regulacion ?? "—"}`,
    `nota_actualizar=${input.negocio.nota ?? "—"}`,
    `urls=${input.negocio.urls ?? "—"}`,
    "",
    "DOCUMENTOS:",
    docsBlock
  ].join("\n");

  let text = "";
  try {
    text = await generateAiText(prompt);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isQuotaErrorMessage(msg)) {
      const retry = parseRetrySeconds(msg);
      throw new Error(`GEMINI_QUOTA: Sin cuota IA (reintentar en ${retry ?? 60}s).`);
    }
    throw new Error(`GEMINI_MAP_ERROR: ${msg}`);
  }
  const json = normalizeGeminiJson(text);
  if (!json) throw new Error(`GEMINI_BAD_RESPONSE: Sin JSON. Respuesta=${sample(text, 600)}`);

  try {
    const p = JSON.parse(json) as { docs?: DocAplicacion[]; items?: GeminiExtractionItem[] };
    const docs = Array.isArray(p.docs) ? p.docs : [];
    const items = Array.isArray(p.items) ? p.items : [];
    return { docs, items };
  } catch {
    throw new Error(`GEMINI_BAD_JSON: No se pudo parsear JSON. Respuesta=${sample(text, 600)}`);
  }
}
