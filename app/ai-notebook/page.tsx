"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getSelectedNegocioId } from "@/components/business/BusinessPicker";
import type { GeminiExtractionItem } from "@/app/api/gemini/extract/route";
import { estimateUsdFromSanction, classifyPrioridad, computePriorityScore } from "@/lib/finance";
import { PdfQnA } from "@/components/ai/PdfQnA";
import {
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL_DEFAULT,
  LEGAL_DRIVE_FOLDER_ID,
  LEGAL_DRIVE_FOLDER_URL
} from "@/lib/legal-constants";
import type { ComparacionNormativa } from "@/types/domain";
import { labelClasificacionDoc } from "@/lib/normativa-titles";
import { fetchNormativaDocsForNegocio, type NormativaDocListRow } from "@/lib/normativa-docs-query";
import { estimateBatchSeconds, SECONDS_PER_PDF_ESTIMATE } from "@/lib/pdf-remote";
import { groupByObligacionGrupo } from "@/lib/obligacion-grupo";
import { normalizeOrganizacion4 } from "@/lib/matriz-gerencia-jefatura";

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

function IconLinkChain({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDriveCloud({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M7 18h11a3.5 3.5 0 0 0 0-7h-.5A5 5 0 0 0 7 8.5v0A4 4 0 0 0 7 18Z"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path d="M12 11v4m-2-2h4" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

function IconFolderMini({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M4 6a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.6.8L12 6h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUserBadge({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="9" r="3" strokeWidth="1.5" />
      <path d="M6 19v0a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
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
  const [urlLines, setUrlLines] = useState("");
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);
  const [driveFiles, setDriveFiles] = useState<
    { id: string; name: string; mimeType: string | null; modifiedTime: string | null }[]
  >([]);
  const [driveListBusy, setDriveListBusy] = useState(false);
  const [driveListError, setDriveListError] = useState<string | null>(null);
  const [driveServiceEmail, setDriveServiceEmail] = useState<string | null>(null);
  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string>>(new Set());

  const previewGrupos = useMemo(() => groupByObligacionGrupo(items), [items]);

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
        credentials: "include",
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
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(docViejoId) || !uuidRe.test(lastNormativaDocId)) {
      setError(
        "El análisis no devolvió un identificador de documento válido. Sube de nuevo el PDF para repetir la comparación de versiones, o reintenta tras recargar la página."
      );
      return;
    }
    setReplaceBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/normativa/authorize-replace", {
        method: "POST",
        credentials: "include",
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

  type IngestApiPayload = {
    items?: GeminiExtractionItem[];
    error?: string;
    code?: string;
    retry_after_seconds?: number;
    normativa_doc_id?: string;
    comparacion?: ComparacionNormativa;
    fuente_url?: string | null;
    storage_path?: string | null;
    ingest_aviso?: string | null;
    /** Devuelto por ingest (mismo valor que meta en /api/gemini/extract) */
    items_omitidos_por_no_aplicables?: number;
    meta?: { items_omitidos_por_no_aplicables?: number };
  };

  async function applyIngestSuccess(
    data: IngestApiPayload,
    displayName: string,
    origen: "pdf_upload" | "pdf_url" | "pdf_drive",
    opts?: { appendMapMsg?: boolean }
  ) {
    if (!supabase || !negocioId) return;
    const extracted = data.items ?? [];
    setItems(extracted);
    if (data.normativa_doc_id) setLastNormativaDocId(data.normativa_doc_id);
    if (data.comparacion) setComparacion(data.comparacion);
    setLastUploads((prev) => [{ fileName: displayName, items: extracted }, ...prev].slice(0, 6));

    const normativaDocId = data.normativa_doc_id;
    const fuenteUrl = data.fuente_url ?? null;

    const payload = extracted.map((it) => {
      const multa = estimateUsdFromSanction(it.sancion);
      const score = computePriorityScore(it.impacto_economico, it.probabilidad_incumplimiento);
      const prioridad = classifyPrioridad({ sancion: it.sancion, multa_estimada_usd: multa, priorityScore: score });
      const org = normalizeOrganizacion4(it);
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
        sponsor: org.sponsor,
        responsable_proceso: org.responsable_proceso,
        articulo: it.articulo || "—",
        requisito: it.requisito,
        sancion: it.sancion,
        cita_textual: it.cita_textual,
        link_fuente_oficial: it.link_fuente_oficial,
        fuente_verificada_url: it.fuente_verificada_url ?? fuenteUrl,
        gerencia_competente: org.gerencia_competente,
        area_competente: org.area_competente,
        multa_estimada_usd: multa,
        impacto_economico: it.impacto_economico,
        probabilidad_incumplimiento: it.probabilidad_incumplimiento,
        prioridad,
        estado: "pendiente" as const,
        normativa_doc_id: normativaDocId ?? null,
        extra: {
          origen,
          comparacion: data.comparacion ?? null,
          obligacion_grupo_id: it.obligacion_grupo_id ?? null,
          obligacion_grupo_etiqueta: it.obligacion_grupo_etiqueta ?? null,
          obligacion_resumen_consolidado: it.obligacion_resumen_consolidado ?? null,
          aplica_a_negocio_descrito: it.aplica_a_negocio_descrito ?? true,
          motivo_aplicabilidad: it.motivo_aplicabilidad ?? null
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
        file_name: displayName,
        comparacion: data.comparacion,
        origen
      }
    });

    await loadNormativaDocs();

    const aviso = typeof data.ingest_aviso === "string" ? data.ingest_aviso.trim() : "";
    const omitidos =
      typeof data.items_omitidos_por_no_aplicables === "number"
        ? data.items_omitidos_por_no_aplicables
        : data.meta?.items_omitidos_por_no_aplicables;
    const lineParts = [
      extracted.length > 0
        ? `Última extracción (${displayName}): ${extracted.length} ítem(s) aplicable(s) al negocio.`
        : `Última extracción (${displayName}): ningún ítem aplicable al modelo de negocio activo.`,
      aviso || null,
      typeof omitidos === "number" && omitidos > 0 && !aviso
        ? `${omitidos} requisito(s) descartados por aplicabilidad.`
        : null
    ].filter(Boolean);
    const line = lineParts.join(" ");
    setMapMsg((prev) =>
      opts?.appendMapMsg && prev?.trim() ? `${prev.trim()}\n${line}` : line
    );
  }

  function parseIngestJson(rawText: string, res: Response): IngestApiPayload {
    let data: IngestApiPayload;
    try {
      data = JSON.parse(rawText) as IngestApiPayload;
    } catch {
      throw new Error(rawText.slice(0, 260));
    }
    if (!res.ok || data.error) {
      if (res.status === 429 && data.code === "GEMINI_QUOTA") {
        throw new Error(`Gemini sin cuota. Espera ${data.retry_after_seconds ?? 60}s y vuelve a intentar.`);
      }
      throw new Error(data.error ?? "No se pudo procesar el PDF");
    }
    return data;
  }

  async function uploadPdf(file: File, opts?: { batch?: { i: number; total: number } }) {
    if (!negocioId) {
      setError("Selecciona un negocio primero.");
      return false;
    }
    setError(null);
    setBusy(true);
    const total = opts?.batch?.total ?? 1;
    const estTotal = estimateBatchSeconds(total);
    setBusyMsg(
      opts?.batch
        ? `Archivo ${opts.batch.i + 1}/${opts.batch.total}: ${file.name} · ~${SECONDS_PER_PDF_ESTIMATE}s c/u · cola ~${estTotal}s`
        : `Procesando: ${file.name} · tiempo típico ~${SECONDS_PER_PDF_ESTIMATE}s`
    );
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

      const res = await fetch("/api/pdfs/process", { method: "POST", credentials: "include", body: form });
      const rawText = await res.text();
      const data = parseIngestJson(rawText, res);
      await applyIngestSuccess(data, file.name, "pdf_upload");
      return true;
    } catch (e: unknown) {
      setError(formatUiError(e));
      return false;
    } finally {
      setBusy(false);
      setBusyMsg(null);
    }
  }

  function toggleDriveFile(id: string) {
    setSelectedDriveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function cargarListaDrive() {
    setDriveListError(null);
    setDriveListBusy(true);
    try {
      const res = await fetch(`/api/drive/list?folder_id=${encodeURIComponent(LEGAL_DRIVE_FOLDER_ID)}`, {
        credentials: "include"
      });
      const data = (await res.json()) as {
        configured?: boolean;
        service_account_email?: string;
        hint?: string;
        error?: string;
        files?: { id: string; name: string; mimeType: string | null; modifiedTime: string | null }[];
      };
      setDriveServiceEmail(data.service_account_email ?? GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL_DEFAULT);
      setDriveConfigured(Boolean(data.configured));
      if (data.error) setDriveListError(data.error);
      else if (!data.configured && data.hint) setDriveListError(data.hint);
      else setDriveListError(null);
      setDriveFiles(Array.isArray(data.files) ? data.files : []);
    } catch (e: unknown) {
      setDriveListError(e instanceof Error ? e.message : "No se pudo listar Drive");
      setDriveFiles([]);
    } finally {
      setDriveListBusy(false);
    }
  }

  async function importarSeleccionadosDrive() {
    if (!negocioId) {
      setError("Selecciona un negocio primero.");
      return;
    }
    const ids = [...selectedDriveIds];
    if (ids.length === 0) {
      setError("Marca al menos un archivo de la lista de Drive.");
      return;
    }
    if (ids.length > 12) {
      setError("Máximo 12 archivos por lote desde Drive.");
      return;
    }
    setError(null);
    setBusy(true);
    setItems([]);
    setComparacion(null);
    setLastNormativaDocId(null);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No autenticado");

      for (let i = 0; i < ids.length; i++) {
        const fileId = ids[i]!;
        const meta = driveFiles.find((f) => f.id === fileId);
        const label = meta?.name ?? fileId;
        setBusyMsg(
          `Drive ${i + 1}/${ids.length}: ${label} · ~${SECONDS_PER_PDF_ESTIMATE}s este archivo · ~${estimateBatchSeconds(ids.length - i)}s restantes (estimado)`
        );
        const res = await fetch("/api/drive/ingest", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ negocio_id: negocioId, file_id: fileId })
        });
        const rawText = await res.text();
        const data = parseIngestJson(rawText, res);
        await applyIngestSuccess(data, label, "pdf_drive", { appendMapMsg: i > 0 });
      }
      setSelectedDriveIds(new Set());
      setMapMsg((prev) =>
        `Listo: ${ids.length} archivo(s) importados desde Drive (biblioteca + propuestas).${prev?.trim() ? `\n${prev.trim()}` : ""}`
      );
    } catch (e: unknown) {
      setError(formatUiError(e));
    } finally {
      setBusy(false);
      setBusyMsg(null);
    }
  }

  async function procesarUrlsPdf() {
    if (!negocioId) {
      setError("Selecciona un negocio primero.");
      return;
    }
    const lines = urlLines
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError("Pega al menos una URL (enlace de archivo en Drive o PDF público), una por línea.");
      return;
    }
    if (lines.length > 15) {
      setError("Máximo 15 URLs por lote. Divide en varias ejecuciones.");
      return;
    }
    setError(null);
    setBusy(true);
    setItems([]);
    setComparacion(null);
    setLastNormativaDocId(null);
    const totalEst = estimateBatchSeconds(lines.length);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No autenticado");

      for (let i = 0; i < lines.length; i++) {
        const url = lines[i]!;
        const remaining = lines.length - i;
        setBusyMsg(
          `URL ${i + 1}/${lines.length} · ~${SECONDS_PER_PDF_ESTIMATE}s este archivo · ~${estimateBatchSeconds(remaining)}s restantes (estimado)`
        );
        const res = await fetch("/api/pdfs/from-url", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ negocio_id: negocioId, url })
        });
        const rawText = await res.text();
        const data = parseIngestJson(rawText, res);
        const label = url.length > 72 ? `${url.slice(0, 70)}…` : url;
        await applyIngestSuccess(data, label, "pdf_url", { appendMapMsg: i > 0 });
      }
      setUrlLines("");
      setMapMsg((prev) =>
        `Listo: ${lines.length} PDF(s) desde URL indexados en la biblioteca y propuestas generadas.${prev?.trim() ? `\n${prev.trim()}` : ""}`
      );
    } catch (e: unknown) {
      setError(formatUiError(e));
    } finally {
      setBusy(false);
      setBusyMsg(null);
    }
  }

  // Subida secuencial (reduce rate-limit).

  async function eliminarSeleccionados() {
    if (!negocioId) return;
    const ids = [...selectedDocIds];
    if (ids.length === 0) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/normativa/delete", {
        method: "POST",
        credentials: "include",
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
        . Comparte esa carpeta (o la que definas con{" "}
        <code className="rounded bg-white/80 px-1 py-0.5 text-[10px]">GOOGLE_DRIVE_NORMATIVA_FOLDER_ID</code>) con la
        cuenta de servicio{" "}
        <code className="rounded bg-white/80 px-1 py-0.5 text-[10px]">{GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL_DEFAULT}</code>{" "}
        y configura <code className="rounded bg-white/80 px-1 py-0.5 text-[10px]">GOOGLE_DRIVE_PRIVATE_KEY</code> en
        el servidor para <strong>listar e importar PDFs y Google Docs</strong> desde AI Notebook sin enlaces públicos. La
        fuente de verdad interna sigue siendo Supabase; tras autorizar un reemplazo, el PDF queda guardado aquí.
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
            <div className="mt-5 space-y-4">
              <div className="text-sm font-medium">Subir PDF desde tu equipo</div>
              <div className="text-xs text-charcoal/60">
                Puedes elegir <strong>uno o varios</strong> archivos (.pdf). Se procesan uno tras otro. Tiempo orientativo: ~{SECONDS_PER_PDF_ESTIMATE}s por
                archivo (descarga, extracción e IA). La normativa queda en la <strong>biblioteca común</strong>; las propuestas se asocian al negocio activo.
              </div>
              <input
                type="file"
                accept="application/pdf"
                multiple
                disabled={busy || !supabase}
                onChange={(e) => {
                  const list = e.target.files;
                  if (!list?.length) return;
                  const files = [...list];
                  void (async () => {
                    for (let i = 0; i < files.length; i++) {
                      const ok = await uploadPdf(files[i]!, { batch: { i, total: files.length } });
                      if (!ok) break;
                    }
                  })();
                  e.currentTarget.value = "";
                }}
                className="block w-full text-sm"
              />

              <div className="rounded-2xl border border-borderSoft bg-gradient-to-b from-white to-cream/90 p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-charcoal/[0.07] text-charcoal">
                    <IconLinkChain className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-charcoal">Desde URL (Drive o PDF público)</div>
                    <p className="mt-1 text-xs leading-relaxed text-charcoal/65">
                      <strong className="text-charcoal/80">Carpetas:</strong> no se abren enteras. Comparte cada PDF como «Cualquiera con el enlace» y pega{" "}
                      <strong>un enlace por línea</strong>. Válidas también URLs directas a <code className="rounded bg-white/90 px-1">.pdf</code>.
                    </p>
                  </div>
                </div>
                <textarea
                  value={urlLines}
                  onChange={(e) => setUrlLines(e.target.value)}
                  disabled={busy || !supabase}
                  placeholder={"https://drive.google.com/file/d/XXXX/view\nhttps://…otro.pdf"}
                  className="mt-3 min-h-[92px] w-full rounded-xl bg-white px-3 py-2.5 text-xs ring-1 ring-borderSoft focus:outline-none focus:ring-2 focus:ring-sidebarRose/30"
                />
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-charcoal/50">
                  <span className="inline-block h-1 w-1 rounded-full bg-charcoal/35" aria-hidden />
                  ~{SECONDS_PER_PDF_ESTIMATE}s × número de líneas (referencia)
                </div>
                <button
                  type="button"
                  disabled={busy || !supabase || !negocioId}
                  onClick={() => void procesarUrlsPdf()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-charcoal px-4 py-2.5 text-sm font-medium text-cream hover:bg-charcoal/90 disabled:opacity-50"
                >
                  <IconLinkChain className="h-4 w-4 opacity-90" />
                  {busy ? "Procesando URLs…" : "Descargar e indexar URLs"}
                </button>
              </div>

              <div className="rounded-2xl border border-borderSoft bg-gradient-to-b from-white to-cream/90 p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sidebarRose/12 text-sidebarRose">
                    <IconDriveCloud className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-charcoal">Google Drive (cuenta de servicio)</div>
                    <p className="mt-1 text-xs leading-relaxed text-charcoal/65">
                      Listado e importación con la misma IA que al subir un PDF. Sin copiar enlaces públicos.
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2 rounded-xl bg-white/70 px-3 py-2.5 text-[11px] text-charcoal/70 ring-1 ring-borderSoft/80">
                  <li className="flex gap-2">
                    <IconFolderMini className="mt-0.5 h-4 w-4 shrink-0 text-charcoal/45" />
                    <span>
                      Carpeta por defecto:{" "}
                      <code className="rounded bg-cream px-1.5 py-0.5 text-[10px] text-charcoal/90">{LEGAL_DRIVE_FOLDER_ID}</code> ·{" "}
                      <a className="text-sidebarRose underline" href={LEGAL_DRIVE_FOLDER_URL} target="_blank" rel="noreferrer">
                        Abrir en Drive
                      </a>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <IconUserBadge className="mt-0.5 h-4 w-4 shrink-0 text-charcoal/45" />
                    <span>
                      Comparte la carpeta con{" "}
                      <code className="break-all rounded bg-cream px-1.5 py-0.5 text-[10px] text-charcoal/90">
                        {driveServiceEmail ?? GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL_DEFAULT}
                      </code>
                    </span>
                  </li>
                </ul>
                <button
                  type="button"
                  disabled={driveListBusy || !supabase}
                  onClick={() => void cargarListaDrive()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-borderSoft bg-white px-4 py-2.5 text-sm font-medium text-charcoal shadow-sm hover:bg-cream/60 disabled:opacity-50"
                >
                  <IconDriveCloud className="h-4 w-4 text-sidebarRose" />
                  {driveListBusy ? "Consultando Drive…" : "Cargar lista desde Drive"}
                </button>
                {driveConfigured === false ? (
                  <div
                    className="mt-3 rounded-xl border border-sky-200/80 bg-sky-50/90 px-3 py-2.5 text-xs leading-snug text-sky-950"
                    role="status"
                  >
                    <span className="font-medium text-sky-900">Servidor sin clave de Drive.</span>{" "}
                    {driveListError ??
                      "Añade GOOGLE_DRIVE_PRIVATE_KEY en .env.local (local) o en variables de Vercel (producción)."}
                  </div>
                ) : null}
                {driveConfigured === true && driveListError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-[11px] leading-snug text-red-900">
                    {driveListError}
                  </div>
                ) : null}
                {driveFiles.length > 0 ? (
                  <div className="mt-3 max-h-52 space-y-1 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-borderSoft">
                    {driveFiles.map((f) => (
                      <label
                        key={f.id}
                        className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-xs hover:bg-cream/90"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedDriveIds.has(f.id)}
                          onChange={() => toggleDriveFile(f.id)}
                        />
                        <span className="min-w-0 leading-snug">
                          <span className="font-medium text-charcoal">{f.name}</span>
                          <span className="mt-0.5 block text-[10px] text-charcoal/50">
                            {f.mimeType === "application/vnd.google-apps.document" ? "Google Doc → PDF" : "PDF"} ·{" "}
                            {f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : "—"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {driveConfigured === true && !driveListBusy && !driveListError && driveFiles.length === 0 ? (
                  <div className="mt-3 rounded-lg bg-charcoal/[0.04] px-3 py-2 text-center text-[11px] text-charcoal/55">
                    No hay PDFs ni Google Docs en esa carpeta.
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={busy || !supabase || !negocioId || selectedDriveIds.size === 0 || driveFiles.length === 0}
                  onClick={() => void importarSeleccionadosDrive()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-sidebarRose px-4 py-2.5 text-sm font-medium text-cream hover:opacity-95 disabled:opacity-50"
                >
                  <IconDriveCloud className="h-4 w-4 text-cream/95" />
                  {busy ? "Importando desde Drive…" : "Importar seleccionados"}
                </button>
              </div>

              {busy ? <div className="text-sm text-charcoal/70">{busyMsg ?? "Procesando (PDF + IA)…"}</div> : null}
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
            {previewGrupos.map(({ key, list }) => {
              const isG = list.length > 1;
              const etiqueta = list[0]?.obligacion_grupo_etiqueta?.trim();
              const consolidado =
                list.map((x) => x.obligacion_resumen_consolidado?.trim()).find((s) => s && s.length >= 15) ?? null;
              const card = (it: GeminiExtractionItem, iKey: string) => (
                <div key={iKey} className="rounded-2xl bg-cream p-4 ring-1 ring-borderSoft">
                  <div className="text-sm font-semibold">{it.articulo || "—"}</div>
                  <div className="mt-1 text-sm">{it.requisito}</div>
                  <div className="mt-2 text-xs text-charcoal/60">{it.cita_textual ?? "—"}</div>
                  <div className="mt-2 text-xs text-charcoal/70">Sanción: {it.sancion ?? "—"}</div>
                  {it.fuente_verificada_url ? (
                    <a
                      className="mt-2 inline-block text-xs text-sidebarRose underline"
                      href={it.fuente_verificada_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Fuente verificada
                    </a>
                  ) : null}
                </div>
              );
              if (!isG) return <div key={key}>{card(list[0]!, key)}</div>;
              return (
                <div key={key} className="rounded-2xl border border-sidebarRose/20 bg-cream/50 p-4 ring-1 ring-borderSoft">
                  <div className="text-xs font-semibold text-sidebarRose">Obligación agrupada · {list.length} artículos</div>
                  {etiqueta ? <div className="mt-1 text-xs text-charcoal/70">{etiqueta}</div> : null}
                  {consolidado ? (
                    <div className="mt-3 rounded-xl bg-white p-3 text-sm leading-relaxed text-charcoal ring-1 ring-borderSoft">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-charcoal/45">Resumen unificado</div>
                      <p className="mt-1">{consolidado}</p>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-charcoal/55">Abre el desglose para ver el detalle por artículo.</div>
                  )}
                  <details className="mt-3 rounded-xl ring-1 ring-borderSoft bg-white/70">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-charcoal marker:content-none [&::-webkit-details-marker]:hidden">
                      Desglose por artículo ({list.length})
                    </summary>
                    <div className="space-y-3 border-t border-borderSoft p-3">{list.map((it, j) => card(it, `${key}-${j}`))}</div>
                  </details>
                </div>
              );
            })}
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
