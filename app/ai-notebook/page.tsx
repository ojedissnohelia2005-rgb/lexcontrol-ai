"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getSelectedNegocioId } from "@/components/business/BusinessPicker";
import type { GeminiExtractionItem } from "@/app/api/gemini/extract/route";
import { estimateUsdFromSanction, classifyPrioridad, computePriorityScore } from "@/lib/finance";
import { PdfQnA } from "@/components/ai/PdfQnA";
import { LEGAL_DRIVE_FOLDER_URL } from "@/lib/legal-constants";
import type { ComparacionNormativa } from "@/types/domain";
import { labelClasificacionDoc } from "@/lib/normativa-titles";
import { fetchNormativaDocsForNegocio, type NormativaDocListRow } from "@/lib/normativa-docs-query";

type NegocioMini = { id: string; nombre: string; sector: string | null; detalles_negocio: string | null };

type NormativaRow = NormativaDocListRow;

function formatUiError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.toLowerCase();
  if (m.includes("429") || m.includes("quota") || m.includes("too many requests") || m.includes("gemini sin cuota")) {
    const retry = raw.match(/(\d+)\s*s/i)?.[1];
    return `Gemini sin cuota. ${retry ? `Espera ${retry}s y reintenta.` : "Espera ~60s y reintenta."}`;
  }
  // evita cajas gigantes
  if (raw.length > 280) return raw.slice(0, 260) + "…";
  return raw;
}

export default function AiNotebookPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [negocios, setNegocios] = useState<NegocioMini[]>([]);
  const [negocio, setNegocio] = useState<NegocioMini | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapMsg, setMapMsg] = useState<string | null>(null);
  const [items, setItems] = useState<GeminiExtractionItem[]>([]);
  const [fuente, setFuente] = useState<"memoria" | "subir">("memoria");
  const [normativaDocs, setNormativaDocs] = useState<NormativaRow[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [comparacion, setComparacion] = useState<ComparacionNormativa | null>(null);
  const [lastNormativaDocId, setLastNormativaDocId] = useState<string | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [lastUploads, setLastUploads] = useState<Array<{ fileName: string; items: GeminiExtractionItem[] }>>([]);
  const [batchUploads, setBatchUploads] = useState<Array<{ fileName: string; ok: boolean; msg: string }>>([]);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadNormativaDocs = useCallback(async () => {
    if (!supabase || !negocioId) return;
    const { data, error } = await fetchNormativaDocsForNegocio(supabase, negocioId);
    if (error) {
      setError(error.message);
      setNormativaDocs([]);
    } else {
      setNormativaDocs((data ?? []) as NormativaRow[]);
    }
  }, [supabase, negocioId]);

  useEffect(() => {
    const id = getSelectedNegocioId();
    setNegocioId(id);
    if (!supabase) return;
    supabase
      .from("negocios")
      .select("id,nombre,sector,detalles_negocio")
      .order("created_at", { ascending: false })
      .then(({ data }) => setNegocios((data ?? []) as NegocioMini[]));
  }, [supabase]);

  useEffect(() => {
    void loadNormativaDocs();
  }, [loadNormativaDocs]);

  useEffect(() => {
    if (!negocioId) {
      setNegocio(null);
      return;
    }
    const found = negocios.find((n) => n.id === negocioId) ?? null;
    setNegocio(found);
  }, [negocioId, negocios]);

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generarMapaNormativa() {
    if (!negocioId) {
      setError("Selecciona un negocio primero.");
      return;
    }
    const ids = [...selectedDocIds];
    if (ids.length === 0) {
      setError("Selecciona al menos un PDF en memoria.");
      return;
    }
    setError(null);
    setMapMsg(null);
    setMapBusy(true);
    try {
      const res = await fetch("/api/gemini/map-negocio-normativa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ negocio_id: negocioId, normativa_doc_ids: ids })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        aplicacion?: { doc_id: string; aplica: boolean; motivo: string }[];
        items_generados?: number;
        warning?: string | null;
        code?: string;
        retry_after_seconds?: number;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error en mapeo IA");
      setMapMsg(
        `Análisis listo: ${data.items_generados ?? 0} sugerencias enviadas a Propuestas.` +
          (data.warning ? ` ${data.warning}` : "") +
          " " +
          (data.aplicacion?.length
            ? data.aplicacion.map((a) => `${a.aplica ? "Aplica" : "No aplica"} (${a.doc_id.slice(0, 8)}…): ${a.motivo}`).join(" · ")
            : "")
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setMapBusy(false);
    }
  }

  async function autorizarReemplazo(docViejoId: string) {
    if (!negocioId || !lastNormativaDocId) return;
    setReplaceBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/normativa/authorize-replace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          negocio_id: negocioId,
          documento_reemplazar_id: docViejoId,
          nuevo_documento_id: lastNormativaDocId
        })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo actualizar");
      setComparacion(null);
      setLastNormativaDocId(null);
      setMapMsg("Versión en base de datos actualizada (registro unificado). Vuelve a cargar la matriz si hace falta.");
      await loadNormativaDocs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setReplaceBusy(false);
    }
  }

  async function uploadPdf(file: File, opts?: { batch?: { i: number; total: number } }) {
    if (!negocioId) {
      setError("Selecciona un negocio primero.");
      return false;
    }
    setError(null);
    setBusy(true);
    setBusyMsg(opts?.batch ? `Procesando ${opts.batch.i + 1}/${opts.batch.total}: ${file.name}` : `Procesando: ${file.name}`);
    if (!opts?.batch) {
      setItems([]);
      setComparacion(null);
      setLastNormativaDocId(null);
    }
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No autenticado");

      const form = new FormData();
      form.set("file", file);
      form.set("negocio_id", negocioId);

      const res = await fetch("/api/pdfs/process", { method: "POST", body: form });
      const rawText = await res.text();
      let data: {
        items?: GeminiExtractionItem[];
        error?: string;
        code?: string;
        retry_after_seconds?: number;
        normativa_doc_id?: string;
        comparacion?: ComparacionNormativa;
        fuente_url?: string | null;
        storage_path?: string | null;
      };
      try {
        data = JSON.parse(rawText);
      } catch {
        // Respuesta no JSON (por ejemplo, HTML de error de Vercel)
        throw new Error(rawText.slice(0, 260));
      }
      if (!res.ok || data.error) {
        if (res.status === 429 && data.code === "GEMINI_QUOTA") {
          throw new Error(`Gemini sin cuota. Espera ${data.retry_after_seconds ?? 60}s y vuelve a intentar.`);
        }
        throw new Error(data.error ?? "No se pudo procesar el PDF");
      }
      const extracted = data.items ?? [];
      setItems(extracted);
      if (data.normativa_doc_id) setLastNormativaDocId(data.normativa_doc_id);
      if (data.comparacion) setComparacion(data.comparacion);
      setLastUploads((prev) => [{ fileName: file.name, items: extracted }, ...prev].slice(0, 6));

      const normativaDocId = data.normativa_doc_id;
      const fuenteUrl = data.fuente_url ?? null;

      const payload = extracted.map((it) => {
        const multa = estimateUsdFromSanction(it.sancion);
        const score = computePriorityScore(it.impacto_economico, it.probabilidad_incumplimiento);
        const prioridad = classifyPrioridad({ sancion: it.sancion, multa_estimada_usd: multa, priorityScore: score });
        return {
          negocio_id: negocioId,
          tipo_norma: it.tipo_norma ?? null,
          norma_nombre: it.norma_nombre ?? null,
          fecha_publicacion: it.fecha_publicacion ?? null,
          organismo_emisor: it.organismo_emisor ?? null,
          resumen_experto: it.resumen_experto ?? null,
          campo_juridico: it.campo_juridico ?? null,
          observaciones: it.observaciones ?? null,
          proceso_actividad_relacionada: it.proceso_actividad_relacionada ?? null,
          sponsor: it.sponsor ?? null,
          responsable_proceso: it.responsable_proceso ?? null,
          articulo: it.articulo || "—",
          requisito: it.requisito,
          sancion: it.sancion,
          cita_textual: it.cita_textual,
          link_fuente_oficial: it.link_fuente_oficial,
          fuente_verificada_url: it.fuente_verificada_url ?? fuenteUrl,
          gerencia_competente: it.gerencia_competente,
          area_competente: it.area_competente,
          multa_estimada_usd: multa,
          impacto_economico: it.impacto_economico,
          probabilidad_incumplimiento: it.probabilidad_incumplimiento,
          prioridad,
          estado: "pendiente",
          normativa_doc_id: normativaDocId ?? null,
          extra: {
            origen: "pdf_upload",
            comparacion: data.comparacion ?? null,
            obligacion_grupo_id: it.obligacion_grupo_id ?? null,
            obligacion_grupo_etiqueta: it.obligacion_grupo_etiqueta ?? null
          }
        };
      });

      if (payload.length > 0) {
        const { error: insErr } = await supabase.from("propuestas_pendientes").insert(payload);
        if (insErr) throw insErr;
      }

      await supabase.from("audit_log").insert({
        accion: "SUBIR_PDF_NORMATIVA",
        tabla: "normativa_docs",
        registro_id: null,
        valor_nuevo: {
          negocio_id: negocioId,
          storage_path: data.storage_path ?? null,
          fuente_url: fuenteUrl,
          file_name: file.name,
          comparacion: data.comparacion
        }
      });

      await loadNormativaDocs();
      return true;
    } catch (e: unknown) {
      setError(formatUiError(e));
      return false;
    } finally {
      setBusy(false);
      setBusyMsg(null);
    }
  }

  // Subida 1x1 (reduce consumo y evita rate-limit por ráfaga).

  async function eliminarSeleccionados() {
    if (!negocioId) return;
    const ids = [...selectedDocIds];
    if (ids.length === 0) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/normativa/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ normativa_doc_ids: ids })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo eliminar");
      setSelectedDocIds(new Set());
      await loadNormativaDocs();
      setMapMsg(`Eliminado: ${ids.length} documento(s) de memoria.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setDeleteBusy(false);
    }
  }

  const puedeReemplazar =
    comparacion &&
    comparacion.relacion === "ACTUALIZACION" &&
    comparacion.nueva_es_mas_reciente === true &&
    comparacion.doc_coincidente_id &&
    lastNormativaDocId;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">AI Notebook</div>
          <div className="mt-1 text-sm text-charcoal/60">
            Mapea la empresa frente a la normativa en base de datos o sube un PDF; la IA compara versiones y genera sugerencias para la matriz.
          </div>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-xl bg-white px-4 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70" href="/negocios">
            Cambiar negocio
          </Link>
          {negocioId ? (
            <Link className="rounded-xl bg-cream px-4 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70" href={`/business/${negocioId}`}>
              Ver matriz
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-cream px-4 py-3 text-xs text-charcoal/70 ring-1 ring-borderSoft">
        <span className="font-medium text-charcoal">Carpeta de referencia (Drive):</span>{" "}
        <a className="text-sidebarRose underline" href={LEGAL_DRIVE_FOLDER_URL} target="_blank" rel="noreferrer">
          Abrir normativa base
        </a>
        . Descarga desde ahí y súbela aquí para que quede en la <strong>base del sistema</strong> (Supabase Storage + memoria). La sincronización automática con Google Drive no está conectada: esta app es la fuente de verdad interna; tras autorizar un reemplazo, actualizamos el registro/PDF guardado aquí.
      </div>

      <div className="mt-6 rounded-2xl bg-white/95 p-6 shadow-card ring-1 ring-borderSoft backdrop-blur">
        <div className="text-sm font-medium">Origen de la información</div>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-cream px-4 py-2 text-sm ring-1 ring-borderSoft has-[:checked]:ring-2 has-[:checked]:ring-sidebarRose">
            <input type="radio" name="fuente" checked={fuente === "memoria"} onChange={() => setFuente("memoria")} />
            Usar normativa ya cargada (biblioteca común a todos los negocios)
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-cream px-4 py-2 text-sm ring-1 ring-borderSoft has-[:checked]:ring-2 has-[:checked]:ring-sidebarRose">
            <input type="radio" name="fuente" checked={fuente === "subir"} onChange={() => setFuente("subir")} />
            Subir nueva normativa (PDF)
          </label>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white/95 p-6 shadow-card ring-1 ring-borderSoft lg:col-span-1">
          <div className="text-sm font-medium">Negocio activo</div>
          <div className="mt-3">
            <select
              className="w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
              value={negocioId ?? ""}
              onChange={(e) => {
                setNegocioId(e.target.value || null);
                setSelectedDocIds(new Set());
              }}
            >
              <option value="">— Selecciona —</option>
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/70 ring-1 ring-borderSoft">
            <div className="font-medium text-charcoal/80">{negocio?.nombre ?? "—"}</div>
            <div className="mt-1">Sector: {negocio?.sector ?? "—"}</div>
            <div className="mt-1 whitespace-pre-wrap">
              {negocio?.detalles_negocio ?? "Sin descripción detallada aún. Puedes completarla en la pantalla del negocio para que la IA tenga más contexto."}
            </div>
          </div>

          {fuente === "memoria" ? (
            <div className="mt-5">
              <div className="text-sm font-medium">Normativa en memoria</div>
              <div className="mt-1 text-xs text-charcoal/60">
                Misma biblioteca de PDFs para <strong>todos los negocios</strong>. Marca uno o varios; la IA indica cuáles aplican al <strong>negocio activo</strong> y crea filas en <strong>Propuestas pendientes</strong>.
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl bg-cream p-2 ring-1 ring-borderSoft">
                {normativaDocs.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-charcoal/60">Sin documentos. Cambia a “Subir nueva normativa”.</div>
                ) : (
                  normativaDocs.map((d) => {
                    const base = d.es_base_sistema === true;
                    return (
                      <label key={d.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/80">
                        <input type="checkbox" checked={selectedDocIds.has(d.id)} onChange={() => toggleDoc(d.id)} />
                        <span className="text-xs leading-snug">
                          <span className="font-medium text-charcoal">
                            {d.titulo ?? "Sin título"}
                            {d.clasificacion_documento ? (
                              <span className="ml-1 rounded-full bg-charcoal/5 px-2 py-0.5 text-[10px] font-semibold text-charcoal/80 ring-1 ring-borderSoft">
                                {labelClasificacionDoc(d.clasificacion_documento)}
                              </span>
                            ) : null}
                            {base ? <span className="ml-1 rounded-full bg-sidebarRose/10 px-2 py-0.5 text-[10px] font-semibold text-sidebarRose">Base sistema</span> : null}
                          </span>
                          <span className="block text-[10px] text-charcoal/50">{new Date(d.created_at).toLocaleString()}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={mapBusy || !negocioId || selectedDocIds.size === 0}
                  className="w-full rounded-xl bg-sidebarRose px-4 py-2 text-sm font-medium text-cream hover:opacity-90 disabled:opacity-50"
                  onClick={() => void generarMapaNormativa()}
                >
                  {mapBusy ? "Mapeando…" : "Mapear empresa y generar sugerencias"}
                </button>
                <button
                  type="button"
                  disabled={deleteBusy || !negocioId || selectedDocIds.size === 0}
                  className="w-full rounded-xl bg-white px-4 py-2 text-sm text-red-700 ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                  onClick={() => void eliminarSeleccionados()}
                >
                  {deleteBusy ? "Eliminando…" : "Eliminar seleccionados (admin)"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="text-sm font-medium">Subir PDF</div>
              <div className="mt-2 text-xs text-charcoal/60">
                Sube un PDF a la vez. Se indexa en memoria, se compara con cargas previas y se extraen requisitos hacia propuestas.
              </div>
              <input
                type="file"
                accept="application/pdf"
                disabled={busy || !supabase}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPdf(f);
                  e.currentTarget.value = "";
                }}
                className="mt-3 block w-full text-sm"
              />
              {busy ? <div className="mt-3 text-sm text-charcoal/60">{busyMsg ?? "Procesando (PDF + IA)…"}</div> : null}
            </div>
          )}

          {comparacion ? (
            <div
              className={`mt-4 rounded-xl px-3 py-3 text-xs ring-1 ${
                comparacion.relacion === "MISMA_NORMA"
                  ? "bg-amber-50 text-amber-950 ring-amber-200"
                  : comparacion.relacion === "ACTUALIZACION"
                    ? "bg-blue-50 text-blue-950 ring-blue-200"
                    : "bg-cream text-charcoal ring-borderSoft"
              }`}
            >
              <div className="font-semibold">Análisis de versión (IA)</div>
              <div className="mt-1">{comparacion.razon}</div>
              <div className="mt-1 text-[11px] opacity-90">
                Tipo: {comparacion.relacion} · Confianza: {Math.round((comparacion.confianza ?? 0) * 100)}%
              </div>
              {puedeReemplazar ? (
                <button
                  type="button"
                  disabled={replaceBusy}
                  className="mt-3 w-full rounded-lg bg-sidebarRose px-3 py-2 text-xs font-medium text-cream disabled:opacity-50"
                  onClick={() => void autorizarReemplazo(comparacion.doc_coincidente_id as string)}
                >
                  {replaceBusy ? "Actualizando…" : "Autorizar y unificar versión en base de datos"}
                </button>
              ) : null}
              {comparacion.relacion === "MISMA_NORMA" && comparacion.doc_coincidente_id ? (
                <div className="mt-2 text-[11px]">Si es un duplicado innecesario, puedes borrar la última carga desde el panel de administración de datos o ignorar propuestas repetidas.</div>
              ) : null}
            </div>
          ) : null}

          {error ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}
          {mapMsg ? <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-900 ring-1 ring-green-200">{mapMsg}</div> : null}
        </div>

        <div className="rounded-2xl bg-white/95 p-6 shadow-card ring-1 ring-borderSoft lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Última extracción (subir PDF)</div>
              <div className="mt-1 text-xs text-charcoal/60">Vista previa antes de revisar en la matriz del negocio.</div>
            </div>
            <div className="text-xs text-charcoal/60">{items.length} ítems</div>
          </div>
          {lastUploads.length > 1 ? (
            <div className="mt-3 rounded-xl bg-cream px-3 py-2 text-xs text-charcoal/70 ring-1 ring-borderSoft">
              Últimos procesados:{" "}
              {lastUploads
                .slice(0, 3)
                .map((u) => `${u.fileName} (${u.items.length})`)
                .join(" · ")}
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-2xl bg-cream p-4 ring-1 ring-borderSoft">
                <div className="text-sm font-semibold">{it.articulo || "—"}</div>
                <div className="mt-1 text-sm">{it.requisito}</div>
                <div className="mt-2 text-xs text-charcoal/60">{it.cita_textual ?? "—"}</div>
                <div className="mt-2 text-xs text-charcoal/70">Sanción: {it.sancion ?? "—"}</div>
                {it.fuente_verificada_url ? (
                  <a className="mt-2 inline-block text-xs text-sidebarRose underline" href={it.fuente_verificada_url} target="_blank" rel="noreferrer">
                    Fuente verificada
                  </a>
                ) : null}
              </div>
            ))}
            {items.length === 0 ? (
              <div className="rounded-xl bg-cream px-3 py-3 text-sm text-charcoal/70 ring-1 ring-borderSoft">
                {fuente === "subir" ? "Sube un PDF para ver la extracción." : "Elige documentos en memoria y ejecuta el mapeo; las sugerencias irán directo a Propuestas."}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <PdfQnA negocioId={negocioId} />
      </div>
    </AppShell>
  );
}
