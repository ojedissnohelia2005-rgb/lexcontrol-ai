import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiFlashModel } from "@/lib/gemini";
import { LEGAL_DRIVE_FOLDER_URL } from "@/lib/legal-constants";

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  /** Si true, persiste el resultado en negocios.guia_fuentes_ia */
  guardar: z.boolean().optional()
});

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

    const model = getGeminiFlashModel();
    const prompt = [
      "Eres asesor legal/compliance para Ecuador (2026).",
      "El usuario describe un negocio y actividades con regulación especial. Debes entregar una GUÍA PRÁCTICA de dónde buscar normativa y actualizaciones.",
      "",
      "Incluye secciones claras con viñetas:",
      "1) Fuentes oficiales prioritarias (Registro Oficial, Asamblea Nacional, ministerios, reguladores sectoriales).",
      "2) Palabras clave y tipos de norma a vigilar (leyes, reglamentos, resoluciones).",
      "3) Cómo cruzar la información con el rubro y las actividades indicadas.",
      "4) Si el usuario indicó normativa que cree desactualizada: qué verificar y en qué orden.",
      "5) Verificación de vigencia institucional: si mencionas entidades (p. ej. en hidrocarburos), aclara que debe confirmarse en fuentes oficiales vigentes (Registro Oficial / sitios .gob.ec) si hubo reestructuración.",
      "",
      `Carpeta de referencia del proyecto (Drive, puede contener leyes): ${LEGAL_DRIVE_FOLDER_URL}`,
      "Nota sectorial (hidrocarburos/GLP): incluye a la ARCH como fuente a revisar (portal oficial .gob.ec) y contrasta en Registro Oficial por reformas recientes.",
      "Si también mencionas rectoría/política (nivel ministerial), NO la afirmes como definitiva: indícalo como 'verificar ente rector vigente' y da el método de contraste (sitio oficial .gob.ec y Registro Oficial). Solo nombra 'Ministerio de Energía y Minas' o el ministerio rector si se desprende del contexto del usuario o si lo presentas explícitamente como 'según fuentes oficiales vigentes a verificar'.",
      "",
      "DATOS DEL NEGOCIO:",
      `Nombre: ${negocio.nombre}`,
      `Sector: ${negocio.sector ?? "—"}`,
      `Detalles generales: ${negocio.detalles_negocio ?? "—"}`,
      `Actividades / regulación especial (usuario): ${negocio.regulacion_actividades_especiales ?? "—"}`,
      `Normativa que el usuario cree que requiere actualización (nota): ${negocio.normativa_actualizar_nota ?? "—"}`,
      `Enlaces / referencias aportadas: ${negocio.normativa_actualizar_urls ?? "—"}`,
      "",
      "Responde en español, tono profesional, sin inventar números de ley; si no sabes un detalle, indica qué consultar en la fuente oficial. No inventes autoridades: cuando haya duda de institución, indica cómo confirmar vigencia en fuentes oficiales."
    ].join("\n");

    const result = await model.generateContent(prompt);
    const guia = result.response.text().trim();

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
