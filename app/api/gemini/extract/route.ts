import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAiText } from "@/lib/ai";
import { propagateObligacionResumenConsolidado } from "@/lib/obligacion-grupo";
import { normalizeOrganizacion4 } from "@/lib/matriz-gerencia-jefatura";
import { itemDebeDescartarsePorHeuristica } from "@/lib/extract-applicability-heuristic";

const BodySchema = z.object({
  texto: z.string().min(50),
  negocio: z
    .object({
      nombre: z.string().optional(),
      sector: z.string().nullable().optional(),
      detalles: z.string().nullable().optional(),
      contexto_rubro: z.string().nullable().optional()
    })
    .optional(),
  fuente_url: z.string().url().nullable().optional()
});

export type GeminiExtractionItem = {
  tipo_norma?: string | null;
  norma_nombre?: string | null;
  fecha_publicacion?: string | null; // YYYY-MM-DD
  organismo_emisor?: string | null;
  resumen_experto?: string | null;
  campo_juridico?: string | null;
  observaciones?: string | null;
  proceso_actividad_relacionada?: string | null;
  sponsor?: string | null;
  responsable_proceso?: string | null;
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
  obligacion_grupo_id?: string | null;
  obligacion_grupo_etiqueta?: string | null;
  /** Párrafo único por grupo: obligación sustantiva en lenguaje claro */
  obligacion_resumen_consolidado?: string | null;
  /** Solo extracción con negocio: true si el deber aplica al modelo de negocio descrito */
  aplica_a_negocio_descrito?: boolean;
  motivo_aplicabilidad?: string | null;
};

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    const perfilNegocio = body.negocio;
    const tieneNegocio = Boolean(
      perfilNegocio?.nombre?.trim() ||
        perfilNegocio?.sector?.trim() ||
        perfilNegocio?.detalles?.trim() ||
        perfilNegocio?.contexto_rubro?.trim()
    );

    const prompt = [
      "Eres un analista legal de cumplimiento en Ecuador (2026).",
      "Trabajarás en varias fases lógicas (reflejadas en un solo JSON de salida).",
      "",
      "FASE 1 — Alcance de la norma:",
      "- Lee el texto e identifica a qué **sujetos obligados** se dirige (ej.: bancos privados y públicos, cooperativas de ahorro, aseguradoras, empleadores en general, comercio minorista, sector público, etc.).",
      "- Si la norma cita órganos como Junta de Política y Regulación Financiera y Monetaria, comités de auditoría de **entidades del sistema financiero**, etc., eso indica ámbito **financiero/supervisado** salvo que el artículo extienda explícitamente la obligación a otros sectores.",
      "",
      tieneNegocio
        ? [
            "FASE 1b — Qué empresa es esta (inferencia, obligatoria antes de extraer):",
            "- Lee **nombre, sector, detalles y rubro** del MODELO DE NEGOCIO y resume mentalmente: ¿actividad principal? (ej. comercialización de GLP, servicios, industria), ¿tiene trabajadores?, ¿sector regulado?",
            "- Esa síntesis define **qué regulaciones del PDF son pertinentes**: una empresa privada con personal que comercializa GLP suele implicar dominios como **laboral, tributario, comercio, seguridad/prevención en instalaciones o productos peligrosos, normativa sectorial de hidrocarburos/combustibles** cuando el texto las mencione — no mezclar con obligaciones cuyo destinatario sea solo el Estado, la cárcel o el sistema financiero supervisado.",
            "- El **COIP** puede aportar ítems a la matriz de una empresa privada **únicamente** si el fragmento versa sobre **penal económico**, **persona jurídica**, **responsabilidad de representantes o administradores** u homologables; no uses el COIP penitenciario para retail/industria genérica.",
            "- **Prioridad**: extrae (y marca aplica_a_negocio_descrito=true) requisitos que un verificador de cumplimiento asignaría **a esta actividad concreta**. Si un artículo del PDF no tiene vínculo razonable con lo que la empresa hace, márcalo false o no lo incluyas.",
            "- No rellenes la matriz con artículos genéricos del mismo cuerpo legal si no atan al **modelo operativo** descrito.",
            "",
            "FASE 2 — Contraste con el MODELO DE NEGOCIO (obligatorio):",
            "Hay un perfil de empresa concreto abajo (nombre, sector, detalles, rubro).",
            "Para **cada** posible requisito que extraigas del texto normativo debes decidir:",
            "  • ¿Ese deber jurídico aplica de verdad a ESE negocio, según el ámbito subjetivo de la norma y lo que hace la empresa?",
            "  • Ej.: obligaciones de comités de auditoría bajo supervisión bancaria **no** aplican a una empresa privada genérica no financiera.",
            "  • COIP / normas penales: para **empresa privada** marca aplica=true **solo** cuando el deber o la sanción incumba a **personas jurídicas**, **representantes o administradores** en delitos **económicos** o conexos con la actividad societaria (fraude, lavado, cohecho, responsabilidad penal de la PJ, etc.).",
            "  • Excluye (aplica=false) artículos centrados en **personas privadas de libertad**, **hacinamiento**, **centros penitenciarios**, **trato en cárceles**, policía en **ejecución penitenciaria** o jueces/fiscales como destinatario **exclusivo** de gestión carcelaria — salvo perfil penitenciario/Estado.",
            "  • gerencia_competente y area_competente deben ser **áreas corporativas plausibles** para el negocio descrito (ej. Operaciones, Finanzas, Legal corporativo, HSE). **Prohibido** inventar órganos inexistentes como «Gerencia de Derecho Penal» si la empresa no es del sector justicia/penal.",
            "Incluye en CADA ítem del array:",
            '  "aplica_a_negocio_descrito": true | false',
            '  "motivo_aplicabilidad": breve (1-2 frases). Si es true: enlaza con la **actividad del negocio** (ej. «comercializador de GLP / empleador»). Si es false: por qué el sujeto obligado no es este operador.',
            "Solo los ítems con aplica_a_negocio_descrito === true se conservarán en el sistema; sé estricto con false cuando el artículo sea exclusivo de otro sector.",
            "Si dudas entre true y false ante un artículo del Estado/policía/penitenciario y un negocio privado no relacionado, elige **false**.",
            ""
          ].join("\n")
        : "No hay perfil de negocio: extrae requisitos de la norma sin filtrar por aplicabilidad (omite aplica_a_negocio_descrito o usa true).",
      "",
      "FASE 3 — Extracción:",
      "Devuelve SOLO JSON válido con la forma:",
      tieneNegocio
        ? "{ items: [ { aplica_a_negocio_descrito, motivo_aplicabilidad, tipo_norma, norma_nombre, fecha_publicacion, organismo_emisor, resumen_experto, campo_juridico, observaciones, proceso_actividad_relacionada, sponsor, responsable_proceso, articulo, requisito, sancion, cita_textual, link_fuente_oficial, fuente_verificada_url, area_competente, gerencia_competente, impacto_economico, probabilidad_incumplimiento, obligacion_grupo_id, obligacion_grupo_etiqueta, obligacion_resumen_consolidado } ] }"
        : "{ items: [ { tipo_norma, norma_nombre, fecha_publicacion, organismo_emisor, resumen_experto, campo_juridico, observaciones, proceso_actividad_relacionada, sponsor, responsable_proceso, articulo, requisito, sancion, cita_textual, link_fuente_oficial, fuente_verificada_url, area_competente, gerencia_competente, impacto_economico, probabilidad_incumplimiento, obligacion_grupo_id, obligacion_grupo_etiqueta, obligacion_resumen_consolidado } ] }",
      "",
      "Reglas de calidad:",
      "- norma_nombre: nombre oficial coherente con el documento.",
      "- fecha_publicacion: YYYY-MM-DD si clara; si no, null.",
      "- articulo: 'Art. N' o similar; si no, '—'.",
      "- requisito: accionable y verificable; si hay perfil de negocio, redacta el deber en función de **operador privado** (no como si fuera un juez o el Estado), salvo que el artículo obligue explícitamente a empresas.",
      "- proceso_actividad_relacionada: alinea con la cadena de actividades del negocio cuando sea posible (ej. «Comercialización y almacenamiento de GLP», «Relaciones de trabajo»).",
      "- cita_textual: fragmento literal breve.",
      "- Sin inventar URLs.",
      "- impacto_economico (1-10), probabilidad_incumplimiento (1-5).",
      "- sponsor y gerencia_competente deben ser el mismo texto (gerencia/unidad a cargo); responsable_proceso y area_competente el mismo (jefatura o área del proceso).",
      "",
      "AGRUPACIÓN — misma obligación en varios artículos:",
      "- Si varios artículos materializan **una sola obligación sustantiva** (ej. plazo de pago tributario + medios/formas de pago), usa el **mismo** obligacion_grupo_id (slug sin espacios, ej. ct-pago-obligaciones-tributarias) y la **misma** obligacion_grupo_etiqueta corta en español.",
      "- En **cada** ítem del grupo incluye obligacion_resumen_consolidado: **un solo párrafo** que unifique el deber (empieza preferiblemente con «La obligación consiste en…»). No copies casi el mismo texto del requisito en ese campo.",
      "- En cada ítem, requisito y cita_textual deben ser **específicos de ese artículo** (detalle normativo); el resumen consolidado es la visión de conjunto.",
      "- Si un artículo es independiente, obligacion_grupo_id y obligacion_resumen_consolidado pueden ser null.",
      "",
      tieneNegocio
        ? [
            "MODELO DE NEGOCIO:",
            `Nombre: ${body.negocio!.nombre?.trim() || "—"} | Sector: ${body.negocio!.sector ?? "—"}`,
            `Detalles: ${body.negocio!.detalles ?? "—"}`,
            body.negocio!.contexto_rubro ? `Rubro / regulación especial: ${body.negocio!.contexto_rubro}` : ""
          ]
            .filter(Boolean)
            .join("\n")
        : "Contexto negocio: (no provisto)",
      "",
      body.fuente_url ? `Fuente proporcionada: ${body.fuente_url}` : "",
      "",
      "TEXTO NORMATIVO (recortado si es largo):",
      body.texto.slice(0, 120_000)
    ]
      .filter(Boolean)
      .join("\n");

    let text = "";
    try {
      text = await generateAiText(prompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.toLowerCase();
      if (m.includes("429") || m.includes("quota") || m.includes("too many requests") || m.includes("rate limit")) {
        const retry = msg.match(/retry in ([0-9.]+)s/i)?.[1];
        return NextResponse.json(
          {
            error: `IA sin cuota (429). ${retry ? `Reintenta en ~${Math.ceil(Number(retry))}s.` : "Espera y vuelve a intentar."}`,
            code: "GEMINI_QUOTA",
            retry_after_seconds: retry ? Math.ceil(Number(retry)) : 60
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Best-effort JSON extraction
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Gemini no devolvió JSON", raw: text }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { items?: GeminiExtractionItem[] };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

    let items = rawItems;
    let omitidos = 0;
    if (tieneNegocio && perfilNegocio) {
      const perfil = {
        nombre: perfilNegocio.nombre,
        sector: perfilNegocio.sector,
        detalles: perfilNegocio.detalles,
        contexto_rubro: perfilNegocio.contexto_rubro
      };
      items = rawItems.filter((it) => {
        if (it.aplica_a_negocio_descrito === false) return false;
        if (itemDebeDescartarsePorHeuristica(it, perfil)) return false;
        return true;
      });
      omitidos = rawItems.length - items.length;
    }

    propagateObligacionResumenConsolidado(items);
    items = items.map((it) => ({ ...it, ...normalizeOrganizacion4(it) }));

    const meta = tieneNegocio ? { items_omitidos_por_no_aplicables: omitidos } : undefined;
    let aviso: string | undefined;
    if (tieneNegocio && rawItems.length > 0 && items.length === 0) {
      aviso =
        "Ningún artículo encaja con tu negocio (p. ej. normativa solo para Estado/penitenciario/banca). Completa nombre, sector y descripción del negocio en el registro del negocio, o sube normativa de tu rubro.";
    } else if (tieneNegocio && omitidos > 0) {
      aviso = `Se omitieron ${omitidos} requisito(s) que la IA consideró no aplicables a tu negocio según sector y descripción.`;
    }

    return NextResponse.json({ items, ...(meta ? { meta } : {}), ...(aviso ? { aviso } : {}) });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en extracción IA" },
      { status: 400 }
    );
  }
}

