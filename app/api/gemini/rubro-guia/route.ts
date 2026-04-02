import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateAiText } from "@/lib/ai";
import { LEGAL_DRIVE_FOLDER_URL } from "@/lib/legal-constants";

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  /** Si true, persiste el resultado en negocios.guia_fuentes_ia */
  guardar: z.boolean().optional()
});

function buildGuiaPrompt(negocio: {
  nombre: string;
  sector: string | null;
  detalles_negocio: string | null;
  regulacion_actividades_especiales: string | null;
  normativa_actualizar_nota: string | null;
  normativa_actualizar_urls: string | null;
}) {
  return [
    "Eres analista legal y compliance senior para Ecuador (2026).",
    "Tu salida debe parecer el resultado de una revisión normativa digital seria (como un asistente con búsqueda y síntesis en fuentes públicas), NO un manual genérico de «cómo buscar en Google».",
    "",
    "OBJETIVO PRINCIPAL: entregar un mapa de NORMATIVA APLICABLE al negocio concreto descrito abajo (nombres de leyes, códigos, reglamentos y, cuando toque, bloques de resoluciones/supervisión), enlazado al sector, actividades y riesgos de ESE negocio.",
    "",
    "FORMATO (Markdown, obligatorio):",
    "- **Síntesis ejecutiva** (2–4 frases): sector en Ecuador + foco de riesgo regulatorio para este caso.",
    "- **Normativa aplicable (lista numerada, 6 a 12 ítems)**. Cada ítem debe tener:",
    "  1) **Tema** (negrita, corto).",
    "  2) **Instrumento**: nombre oficial o habitual de la norma (negrita o entre comillas).",
    "  3) Una o dos frases: **por qué aplica** al negocio usando nombre, sector, detalles y actividades/regulación especial del usuario.",
    "  4) **Jerarquía** al final de la frase: (Marco legal | Reglamentación sectorial | Supervisión / resoluciones | Prevención LA/FT | Protección de datos / clientes | Otro).",
    "  5) **Dónde vigilar** (ente o portal: ej. Registro Oficial, Superintendencia de Bancos, BCE, UAFE, ARCH, etc.).",
    "- Incluye ejemplos concretos según contexto:",
    "  • Si el negocio es **banca / mutual / cooperativa financiera / servicios financieros**: prioriza **Código Orgánico Monetario y Financiero (COMF)**, **Superintendencia de Bancos** (codificación/normas de control), **Banco Central del Ecuador**, **Junta de Política y Regulación Monetaria y Financiera** (normativa que emita), **Ley Orgánica de Protección de Datos Personales**, **prevención de lavado de activos (UAFE)** y **protección al cliente financiero** cuando el contexto lo sugiera.",
    "  • Si es **hidrocarburos / GLP / energía**: **ARCH**, electricidad/gas según actividades, y método de contraste en Registro Oficial.",
    "  • Si es **otro sector**, infiere el régimen más probable en Ecuador y nómbralo con instrumentos reales (no genéricos).",
    "- **Fuentes y vigencia**: indica explícitamente contrastar textos y reformas en **Registro Oficial** y sitios **.gob.ec** vigentes; si un título puede haber sido reformado, añade *(verificar texto consolidado en fuente oficial)*.",
    "- **Qué NO hacer**: no reboses con secciones abstractas del tipo «paso 1 busque en el ministerio» sin nombrar normas; no inventes números de artículo ni fechas de ley; si no estás seguro del título exacto, dilo y señala cómo confirmarlo.",
    "",
    "**Próximo paso – borrador para matriz**: tabla Markdown con columnas exactas:",
    "| Norma / cuerpo normativo | Qué exige (1 línea) | Área responsable sugerida |",
    "con **al menos 5 filas** tomadas de la lista anterior (sin repetir verbatim todo el texto).",
    "",
    `Referencia interna del producto (PDFs de apoyo, no sustituye fuentes oficiales): ${LEGAL_DRIVE_FOLDER_URL}`,
    "",
    "=== Datos del negocio (úsalos en cada ítem donde aplique) ===",
    `Nombre: ${negocio.nombre}`,
    `Sector: ${negocio.sector ?? "—"}`,
    `Detalles: ${negocio.detalles_negocio ?? "—"}`,
    `Actividades / regulación especial: ${negocio.regulacion_actividades_especiales ?? "—"}`,
    `Normativa que el usuario cree desactualizada (nota): ${negocio.normativa_actualizar_nota ?? "—"}`,
    `Enlaces / referencias aportadas (texto; intégralos en la guía como pistas de fuente o temas a contrastar; no puedes abrirlos en tiempo real): ${negocio.normativa_actualizar_urls ?? "—"}`,
    "",
    "Responde en español, tono profesional. Prioriza especificidad sobre amplitud."
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());

    const { data: negocio, error: nErr } = await supabase
      .from("negocios")
      .select(
        "id,nombre,sector,detalles_negocio,regulacion_actividades_especiales,normativa_actualizar_nota,normativa_actualizar_urls"
      )
      .eq("id", body.negocio_id)
      .single();
    if (nErr || !negocio) return NextResponse.json({ error: "Negocio no encontrado o sin acceso" }, { status: 404 });

    const guia = (await generateAiText(buildGuiaPrompt(negocio))).trim();

    if (body.guardar) {
      const { error: uErr } = await supabase
        .from("negocios")
        .update({ guia_fuentes_ia: guia })
        .eq("id", body.negocio_id);
      if (uErr) return NextResponse.json({ error: uErr.message, guia }, { status: 400 });
    }

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "GENERAR_GUIA_RUBRO_IA",
      tabla: "negocios",
      registro_id: body.negocio_id,
      valor_nuevo: { guardado: Boolean(body.guardar) }
    });

    return NextResponse.json({ guia, guardado: Boolean(body.guardar) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
