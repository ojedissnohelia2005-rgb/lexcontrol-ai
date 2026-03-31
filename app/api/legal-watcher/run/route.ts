import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiFlashModel } from "@/lib/gemini";
import { classifyPrioridad, computePriorityScore, estimateUsdFromSanction } from "@/lib/finance";

const BodySchema = z
  .object({
    /** Si se envía, se generan propuestas de matriz para revisión (origen vigilancia_horaria). */
    negocio_id: z.string().uuid().optional()
  })
  .optional();

export const runtime = "nodejs";
export const maxDuration = 60;

// Vigilancia horaria: alertas globales + filas propuestas para un negocio (revisión humana antes de matriz).

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    let negocio_id: string | undefined;
    try {
      const raw = await req.json().catch(() => ({}));
      const bodyParsed = BodySchema.parse(raw);
      negocio_id = bodyParsed?.negocio_id;
    } catch {
      negocio_id = undefined;
    }

    let negocioCtx = "";
    if (negocio_id) {
      const { data: neg, error: ne } = await supabase
        .from("negocios")
        .select(
          "nombre,sector,detalles_negocio,regulacion_actividades_especiales,normativa_actualizar_nota,normativa_actualizar_urls,guia_fuentes_ia"
        )
        .eq("id", negocio_id)
        .single();
      if (ne || !neg) return NextResponse.json({ error: "negocio_id inválido o sin acceso" }, { status: 400 });
      negocioCtx = [
        `Negocio: ${neg.nombre}`,
        `Sector: ${neg.sector ?? "—"}`,
        `Detalles: ${neg.detalles_negocio ?? "—"}`,
        `Regulación / actividades especiales: ${neg.regulacion_actividades_especiales ?? "—"}`,
        `Normativa a actualizar (nota usuario): ${neg.normativa_actualizar_nota ?? "—"}`,
        `URLs usuario: ${neg.normativa_actualizar_urls ?? "—"}`,
        `Guía fuentes previa (resumen): ${(neg.guia_fuentes_ia ?? "").slice(0, 2000)}`
      ].join("\n");
    }

    // Throttle: evita consumir cuota si se ejecutó hace poco
    const minMinutes = 10;
    const since = new Date(Date.now() - minMinutes * 60_000).toISOString();
    const { data: recent } = await supabase
      .from("audit_log")
      .select("id,fecha,valor_nuevo")
      .eq("accion", "LEGAL_WATCHER_RUN")
      .gte("fecha", since)
      .order("fecha", { ascending: false })
      .limit(1);
    if (recent && recent.length > 0) {
      return NextResponse.json({
        ok: true,
        inserted_alertas: 0,
        inserted_propuestas: 0,
        negocio_id: negocio_id ?? null,
        throttled: true,
        message: `Vigilancia ya ejecutada recientemente (últimos ${minMinutes} min).`
      });
    }

    // Normativa real modificada recientemente (últimos 30 días) para usar como base de vigilancia.
    const sinceDocs = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const { data: recientes } = await supabase
      .from("normativa_docs")
      .select("id,titulo,fecha_normativa,texto_extraido")
      .or(`fecha_normativa.gte.${sinceDocs},updated_at.gte.${sinceDocs}`)
      .order("fecha_normativa", { ascending: false })
      .limit(12);

    const docsBlock =
      (recientes ?? [])
        .map(
          (d) =>
            `- id=${d.id} titulo=${d.titulo ?? "—"} fecha=${d.fecha_normativa ?? "desconocida"}\n` +
            `${String(d.texto_extraido ?? "").slice(0, 2000)}`
        )
        .join("\n\n") || "Sin normas recientes (30 días) en la base; responde sin inventar normas.";

    const model = getGeminiFlashModel();
    const prompt = [
      "Vigilancia legal Ecuador 2026 basada SOLO en normas reales de la base de datos (no inventes leyes).",
      "",
      "Contexto de negocio (si aplica):",
      negocio_id ? negocioCtx : "—",
      "",
      "NORMATIVA_MODIFICADA_ULTIMOS_30_DIAS:",
      docsBlock,
      "",
      "Devuelve SOLO JSON con esta forma:",
      "{",
      '  "alertas": [ { "titulo", "resumen", "link_oficial", "impacto_sector", "analisis_veracidad", "verificado" } ],',
      '  "filas_matriz": [ { "articulo", "requisito", "sancion", "cita_textual", "link_fuente_oficial", "impacto_economico", "probabilidad_incumplimiento" } ]',
      "}",
      "",
      "- Usa como fuente principal las normas listadas (si mencionas otras, indícalo como referencia general, no como alerta concreta).",
      "- No inventes números exactos de ley o artículos; si extrapolas, dilo en cita_textual como 'hipótesis para revisión'.",
      negocio_id
        ? "- filas_matriz: 2 a 5 filas accionables que podrían afectar al negocio según la normativa reciente (para revisión humana, nunca aprobación automática)."
        : "- filas_matriz: array vacío [] si no hay negocio_id."
    ].join("\n");

    let text = "";
    try {
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.toLowerCase();
      if (m.includes("429") || m.includes("quota") || m.includes("too many requests")) {
        return NextResponse.json(
          {
            error:
              "Cuota/Rate limit de Gemini excedido. Espera unos minutos o usa otra API key/plan. Se evitó crear alertas/propuestas.",
            code: "GEMINI_QUOTA",
            retry_after_seconds: 60
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "Gemini sin JSON", raw: text }, { status: 502 });

    const geminiJson = JSON.parse(match[0]) as {
      alertas?: Array<Record<string, unknown>>;
      filas_matriz?: Array<Record<string, unknown>>;
      actualizaciones?: Array<Record<string, unknown>>;
    };
    const alertas = Array.isArray(geminiJson.alertas) ? geminiJson.alertas : [];
    const filas = Array.isArray(geminiJson.filas_matriz) ? geminiJson.filas_matriz : [];
    const actualizaciones = Array.isArray(geminiJson.actualizaciones) ? geminiJson.actualizaciones : [];

    let insertedAlertas = 0;
    if (alertas.length > 0) {
      const payload = alertas.map((a) => ({
        titulo: String(a.titulo ?? "Alerta legal"),
        resumen: a.resumen ? String(a.resumen) : null,
        link_oficial: a.link_oficial ? String(a.link_oficial) : null,
        impacto_sector: a.impacto_sector ? String(a.impacto_sector) : null,
        analisis_veracidad: a.analisis_veracidad ? String(a.analisis_veracidad) : null,
        verificado: Boolean(a.verificado ?? false)
      }));
      const { error } = await supabase.from("alertas_legales").insert(payload);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      insertedAlertas = payload.length;
    }

    let insertedPropuestas = 0;
    if (negocio_id && filas.length > 0) {
      const tituloPrimeraAlerta = alertas[0]?.titulo ? String(alertas[0].titulo) : "Vigilancia horaria";
      const propPayload = filas.map((f) => {
        const sancion = f.sancion != null ? String(f.sancion) : null;
        const multa = estimateUsdFromSanction(sancion);
        const impacto = typeof f.impacto_economico === "number" ? f.impacto_economico : null;
        const prob = typeof f.probabilidad_incumplimiento === "number" ? f.probabilidad_incumplimiento : null;
        const score = computePriorityScore(impacto, prob);
        const prioridad = classifyPrioridad({ sancion, multa_estimada_usd: multa, priorityScore: score });
        return {
          negocio_id,
          articulo: String(f.articulo ?? "—"),
          requisito: String(f.requisito ?? "Revisar requisito"),
          sancion,
          cita_textual: f.cita_textual != null ? String(f.cita_textual) : null,
          link_fuente_oficial: f.link_fuente_oficial != null ? String(f.link_fuente_oficial) : null,
          fuente_verificada_url: f.link_fuente_oficial != null ? String(f.link_fuente_oficial) : null,
          multa_estimada_usd: multa,
          impacto_economico: impacto,
          probabilidad_incumplimiento: prob,
          prioridad,
          estado: "pendiente" as const,
          extra: {
            origen: "vigilancia_horaria",
            alerta_contexto: tituloPrimeraAlerta,
            generado_en: new Date().toISOString()
          }
        };
      });
      const { error: pErr } = await supabase.from("propuestas_pendientes").insert(propPayload);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
      insertedPropuestas = propPayload.length;
    }

    let insertedActualizaciones = 0;
    if (actualizaciones.length > 0) {
      const updPayload = actualizaciones
        .map((u) => {
          const normativaId = typeof u.normativa_id === "string" ? u.normativa_id : null;
          if (!normativaId) return null;
          const fuentes = Array.isArray(u.fuentes) ? u.fuentes : null;
          return {
            normativa_doc_id: normativaId,
            tiene_posible_actualizacion: u.posible_actualizacion !== false,
            comentario: u.comentario ? String(u.comentario) : null,
            nivel_confianza: typeof u.nivel_confianza === "number" ? u.nivel_confianza : null,
            fuentes: fuentes ? JSON.stringify(fuentes) : null
          };
        })
        .filter(Boolean) as {
        normativa_doc_id: string;
        tiene_posible_actualizacion: boolean;
        comentario: string | null;
        nivel_confianza: number | null;
        fuentes: string | null;
      }[];
      if (updPayload.length > 0) {
        const { error: uErr } = await supabase.from("alertas_actualizacion_normativa").insert(
          updPayload.map((r) => ({
            ...r,
            fuentes: r.fuentes ? (JSON.parse(r.fuentes) as unknown) : null
          }))
        );
        if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });
        insertedActualizaciones = updPayload.length;
      }
    }

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "LEGAL_WATCHER_RUN",
      tabla: "alertas_legales",
      valor_nuevo: {
        alertas: insertedAlertas,
        propuestas: insertedPropuestas,
        actualizaciones: insertedActualizaciones,
        negocio_id: negocio_id ?? null
      }
    });

    return NextResponse.json({
      ok: true,
      inserted_alertas: insertedAlertas,
      inserted_propuestas: insertedPropuestas,
      inserted_actualizaciones: insertedActualizaciones,
      negocio_id: negocio_id ?? null
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
