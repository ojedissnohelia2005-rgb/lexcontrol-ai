"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { estimateUsdFromSanction, classifyPrioridad, computePriorityScore } from "@/lib/finance";
import { isSuperAdminEmail } from "@/lib/roles";

type Row = {
  id: string;
  estado: "cumplido" | "pendiente" | "no_aplica" | "en_proceso";
  tipo_norma?: string | null;
  norma_nombre?: string | null;
  fecha_publicacion?: string | null;
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
  multa_estimada_usd: number | null;
  responsable: string | null; // compliance
  prioridad: "critico" | "alto" | "medio" | "bajo" | null;
  evidencia_url: string | null;
  link_fuente_oficial: string | null;
  fuente_verificada_url: string | null;
  impacto_economico?: number | null;
  probabilidad_incumplimiento?: number | null;
  gerencia_competente?: string | null;
  area_competente?: string | null;
  normativa_doc_id?: string | null;
  created_at?: string;
};

type AssignableProfile = { id: string; email: string | null; nombre: string | null; rol: string };
type NormativaMini = { id: string; titulo: string | null; fuente_url: string | null; storage_path: string | null; created_at: string };

type Propuesta = {
  id: string;
  articulo: string;
  requisito: string;
  sancion: string | null;
  cita_textual: string | null;
  link_fuente_oficial: string | null;
  fuente_verificada_url: string | null;
  impacto_economico: number | null;
  probabilidad_incumplimiento: number | null;
  estado: "cumplido" | "pendiente" | "no_aplica" | "en_proceso";
  multa_estimada_usd: number | null;
  prioridad: "critico" | "alto" | "medio" | "bajo" | null;
  extra: Record<string, unknown> | null;
  gerencia_competente: string | null;
  area_competente: string | null;
  aplica_usuario: boolean | null;
  asignacion_gerencia: string | null;
  asignacion_jefatura: string | null;
  supervisor_legal_id: string | null;
  normativa_doc_id: string | null;
  updated_at?: string;
};

function esVigilancia(extra: Record<string, unknown> | null | undefined) {
  return extra && typeof extra === "object" && extra.origen === "vigilancia_horaria";
}

function badgeEstado(estado: string) {
  if (estado === "cumplido") return "bg-green-100 text-green-800 ring-green-200";
  if (estado === "en_proceso") return "bg-blue-100 text-blue-800 ring-blue-200";
  if (estado === "pendiente") return "bg-yellow-100 text-yellow-800 ring-yellow-200";
  return "bg-gray-100 text-gray-700 ring-gray-200";
}

function badgePrioridad(p: string | null) {
  if (p === "critico") return "bg-red-100 text-red-800 ring-red-200";
  if (p === "alto") return "bg-orange-100 text-orange-800 ring-orange-200";
  if (p === "medio") return "bg-yellow-100 text-yellow-800 ring-yellow-200";
  return "bg-green-100 text-green-800 ring-green-200";
}

function extractMessage(e: unknown) {
  if (!e) return "Error cargando datos";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e && typeof (e as any).message === "string") return (e as any).message;
  try {
    return JSON.stringify(e);
  } catch {
    return "Error cargando datos";
  }
}

export function BusinessMatrix({ negocioId }: { negocioId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<"user" | "admin" | "super_admin">("user");
  const [assignable, setAssignable] = useState<AssignableProfile[]>([]);
  const [normas, setNormas] = useState<Record<string, NormativaMini>>({});
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [matrixIaNotice, setMatrixIaNotice] = useState<string | null>(null);
  const [iaPanel, setIaPanel] = useState<{ propuestaId: string; titulo: string; texto: string } | null>(null);
  const [iaBusy, setIaBusy] = useState<string | null>(null);
  const [qaPregunta, setQaPregunta] = useState("");
  const [qaPropuestaId, setQaPropuestaId] = useState<string | null>(null);
  const [fillingBlanks, setFillingBlanks] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);

  const canApprove = isSuperAdminEmail(email);
  const canEditMatrix = Boolean(currentUserId && supabase);
  const canAdminMatrix = currentRole === "admin" || currentRole === "super_admin";
  const canDeleteFiles = canAdminMatrix;

  function storagePathFromEvidenceUrl(v: string | null | undefined) {
    if (!v) return null;
    const s = String(v);
    const marker = "/storage/v1/object/public/evidencias-legales/";
    const idx = s.indexOf(marker);
    if (idx >= 0) return s.slice(idx + marker.length);
    if (s.includes("/") && !s.startsWith("http")) return s;
    return null;
  }

  async function loadAll() {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const [m, p, u] = await Promise.all([
        supabase
          .from("matriz_cumplimiento")
          .select(
            "id,estado,tipo_norma,norma_nombre,fecha_publicacion,organismo_emisor,resumen_experto,campo_juridico,observaciones,proceso_actividad_relacionada,sponsor,responsable_proceso,articulo,requisito,sancion,multa_estimada_usd,impacto_economico,probabilidad_incumplimiento,responsable,prioridad,evidencia_url,link_fuente_oficial,fuente_verificada_url,gerencia_competente,area_competente,normativa_doc_id,created_at"
          )
          .eq("negocio_id", negocioId)
          .order("created_at", { ascending: false }),
        supabase
          .from("propuestas_pendientes")
          .select(
            "id,articulo,requisito,sancion,cita_textual,link_fuente_oficial,fuente_verificada_url,impacto_economico,probabilidad_incumplimiento,estado,multa_estimada_usd,prioridad,extra,gerencia_competente,area_competente,aplica_usuario,asignacion_gerencia,asignacion_jefatura,supervisor_legal_id,normativa_doc_id,updated_at"
          )
          .eq("negocio_id", negocioId)
          .order("created_at", { ascending: false }),
        supabase.auth.getUser()
      ]);

      if (m.error) throw m.error;
      if (p.error) throw p.error;
      setRows((m.data ?? []) as Row[]);
      setPropuestas((p.data ?? []) as Propuesta[]);
      setEmail(u.data.user?.email ?? null);
      setCurrentUserId(u.data.user?.id ?? null);
    } catch (e: unknown) {
      const msg = extractMessage(e);
      const lower = msg.toLowerCase();
      if (lower.includes("column") && lower.includes("does not exist")) {
        setError(
          `${msg}\n\nParece que faltan columnas en Supabase. Ejecuta: supabase-migration-matriz-min-fields.sql y supabase-migration-matriz-normativa-doc.sql (SQL Editor), luego recarga.`
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supabase || !currentUserId) return;
    supabase
      .from("profiles")
      .select("rol")
      .eq("id", currentUserId)
      .maybeSingle()
      .then(({ data }) => {
        const r = String((data as { rol?: string } | null)?.rol ?? "user");
        if (r === "admin" || r === "super_admin") setCurrentRole(r);
        else setCurrentRole("user");
      })
      .then(undefined, () => setCurrentRole("user"));
  }, [supabase, currentUserId]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError("Falta configurar Supabase en .env.local");
      return;
    }
    void loadAll();

    const channel = supabase
      .channel(`biz-${negocioId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matriz_cumplimiento", filter: `negocio_id=eq.${negocioId}` },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "propuestas_pendientes", filter: `negocio_id=eq.${negocioId}` },
        () => void loadAll()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, negocioId]);

  useEffect(() => {
    if (!supabase || !negocioId) return;
    supabase
      .from("normativa_docs")
      .select("id,titulo,fuente_url,storage_path,created_at")
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const map: Record<string, NormativaMini> = {};
        for (const d of (data ?? []) as NormativaMini[]) map[d.id] = d;
        setNormas(map);
      })
      .then(undefined, () => setNormas({}));
  }, [supabase, negocioId]);

  useEffect(() => {
    if (!negocioId) return;
    void fetch(`/api/negocios/${negocioId}/assignable-profiles`)
      .then((r) => r.json())
      .then((d: { profiles?: AssignableProfile[]; limited?: boolean }) => {
        setAssignable(d.profiles ?? []);
      })
      .catch(() => setAssignable([]));
  }, [negocioId]);

  async function patchPropuesta(id: string, patch: Partial<Propuesta>) {
    setError(null);
    if (!supabase) {
      setError("Falta configurar Supabase en .env.local");
      return;
    }
    const { error: e } = await supabase.from("propuestas_pendientes").update(patch).eq("id", id);
    if (e) setError(e.message);
    else await loadAll();
  }

  async function updateRow(id: string, patch: Partial<Row>) {
    setError(null);
    if (!supabase) {
      setError("Falta configurar Supabase en .env.local");
      return;
    }
    const { error: e } = await supabase.from("matriz_cumplimiento").update(patch).eq("id", id);
    if (e) setError(e.message);
  }

  async function fillMatrixBlanks() {
    setError(null);
    setMatrixIaNotice(null);
    setFillingBlanks(true);
    try {
      const res = await fetch("/api/matriz/fill-blanks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ negocio_id: negocioId, max_rows: 25 })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        updated?: number;
        notes?: string[];
        error?: string;
        sin_normativa_aviso?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo completar con IA");
      if (data.sin_normativa_aviso) setMatrixIaNotice(data.sin_normativa_aviso);
      const extra = (data.notes ?? []).filter(Boolean).length ? ` · ${(data.notes ?? []).slice(0, 3).join(" | ")}` : "";
      if ((data.updated ?? 0) === 0 && !data.sin_normativa_aviso && !extra) {
        setError("No había filas con campos vacíos o la IA no devolvió datos.");
      }
      if ((data.updated ?? 0) > 0) setError(null);
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error IA");
    } finally {
      setFillingBlanks(false);
    }
  }

  async function deleteMatrixRow(rowId: string) {
    if (!supabase || !canAdminMatrix) return;
    const ok = window.confirm("¿Eliminar esta fila de la matriz? No se puede deshacer.");
    if (!ok) return;
    setDeletingRowId(rowId);
    setError(null);
    try {
      const { error: e } = await supabase.from("matriz_cumplimiento").delete().eq("id", rowId);
      if (e) throw e;
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la fila");
    } finally {
      setDeletingRowId(null);
    }
  }

  async function deleteEvidenceFile(rowId: string, evidenceUrl: string | null) {
    const path = storagePathFromEvidenceUrl(evidenceUrl);
    if (!path) {
      setError("No se pudo identificar el archivo en Storage desde la URL.");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/storage/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bucket: "evidencias-legales", path })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo eliminar");
      await updateRow(rowId, { evidencia_url: null });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error eliminando archivo");
    }
  }

  async function resumenPropuesta(propuestaId: string) {
    setIaBusy(propuestaId);
    setError(null);
    try {
      const res = await fetch("/api/legal-watcher/propuesta-resumen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propuesta_id: propuestaId })
      });
      const data = (await res.json()) as { resumen?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error resumen");
      setIaPanel({ propuestaId, titulo: "Resumen IA (¿agregar a matriz?)", texto: data.resumen ?? "" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setIaBusy(null);
    }
  }

  async function preguntarPropuesta(propuestaId: string) {
    if (!qaPregunta.trim()) {
      setError("Escribe una pregunta.");
      return;
    }
    setIaBusy(propuestaId);
    setError(null);
    try {
      const res = await fetch("/api/legal-watcher/propuesta-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propuesta_id: propuestaId, pregunta: qaPregunta.trim() })
      });
      const data = (await res.json()) as { respuesta?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error Q&A");
      setIaPanel({ propuestaId, titulo: "Respuesta IA", texto: data.respuesta ?? "" });
      setQaPregunta("");
      setQaPropuestaId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setIaBusy(null);
    }
  }

  async function approvePropuesta(propuestaId: string) {
    setError(null);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const res = await fetch("/api/propuestas/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propuesta_id: propuestaId })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo aprobar");
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error aprobando");
    }
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}
      {matrixIaNotice ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">{matrixIaNotice}</div>
      ) : null}
      {!supabase ? (
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Configura Supabase</div>
          <div className="mt-1 text-sm text-charcoal/60">
            Falta <span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span> y <span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> en <span className="font-medium">.env.local</span>.
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-white/95 p-6 shadow-card ring-1 ring-borderSoft backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Matriz de Cumplimiento</div>
            <div className="mt-1 text-xs text-charcoal/60">
              Todos los usuarios con acceso pueden editar celdas. Admin/super admin pueden eliminar filas y archivos. Usa IA para completar campos vacíos.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-charcoal/60">{loading ? "Cargando..." : `${rows.length} requisitos`}</div>
            {supabase ? (
              <>
                <button
                  type="button"
                  disabled={fillingBlanks || !canEditMatrix}
                  className="rounded-xl bg-charcoal px-3 py-2 text-xs font-medium text-cream shadow-sm hover:bg-charcoal/90 disabled:opacity-50"
                  onClick={() => void fillMatrixBlanks()}
                >
                  {fillingBlanks ? "IA trabajando…" : "Completar vacíos (IA)"}
                </button>
                <a
                  className="rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-xs font-medium text-charcoal shadow-sm hover:bg-cream"
                  href={`/api/export/matriz?negocio_id=${negocioId}`}
                  download
                >
                  Excel (CSV)
                </a>
                <a
                  className="rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-xs font-medium text-charcoal shadow-sm hover:bg-cream"
                  href={`/api/export/matriz/pdf?negocio_id=${negocioId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF (imprimir)
                </a>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl bg-cream/40 ring-1 ring-borderSoft">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream/80">
              <tr className="text-xs font-medium uppercase tracking-wide text-charcoal/70">
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Norma</th>
                <th className="px-4 py-3">Fecha pub.</th>
                <th className="px-4 py-3">Organismo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Artículo</th>
                <th className="px-4 py-3">Requisito</th>
                <th className="px-4 py-3">Resumen</th>
                <th className="px-4 py-3">Campo</th>
                <th className="px-4 py-3">Observaciones</th>
                <th className="px-4 py-3">Sanción</th>
                <th className="px-4 py-3">Multa Estimada</th>
                <th className="px-4 py-3">Proceso/Actividad</th>
                <th className="px-4 py-3">Gerencia</th>
                <th className="px-4 py-3">Jefatura resp. proceso</th>
                <th className="px-4 py-3">Documentación</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-borderSoft align-top">
                  <td className="px-4 py-3 min-w-[140px]">
                    <input
                      className="w-[140px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      placeholder="Ley/Regl./Res."
                      value={r.tipo_norma ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { tipo_norma: e.target.value || null } as any)}
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    <input
                      className="w-[220px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      placeholder="Nombre de la norma"
                      value={r.norma_nombre ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { norma_nombre: e.target.value || null } as any)}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <input
                      className="w-[120px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      placeholder="YYYY-MM-DD"
                      value={r.fecha_publicacion ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { fecha_publicacion: e.target.value || null } as any)}
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <input
                      className="w-[180px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      placeholder="Organismo emisor"
                      value={r.organismo_emisor ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { organismo_emisor: e.target.value || null } as any)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-xl bg-cream px-2 py-1 text-xs ring-1 ring-borderSoft"
                      value={r.estado}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { estado: e.target.value as Row["estado"] })}
                    >
                      <option value="cumplido">cumplido</option>
                      <option value="en_proceso">en_proceso</option>
                      <option value="pendiente">pendiente</option>
                      <option value="no_aplica">no_aplica</option>
                    </select>
                    <div className="mt-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[11px] ring-1 ${badgeEstado(r.estado)}`}>{r.estado}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[120px]">
                    <input
                      className="w-[120px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.articulo}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { articulo: e.target.value })}
                      placeholder="Art."
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[280px]">
                    <textarea
                      className="min-h-[72px] w-[280px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.requisito}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { requisito: e.target.value })}
                      placeholder="Requisito"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[240px]">
                    <textarea
                      className="min-h-[64px] w-[240px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.resumen_experto ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { resumen_experto: e.target.value || null } as any)}
                      placeholder="Resumen ejecutivo"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[160px]">
                    <input
                      className="w-[160px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.campo_juridico ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { campo_juridico: e.target.value || null } as any)}
                      placeholder="Tributario/Ambiental..."
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[240px]">
                    <textarea
                      className="min-h-[64px] w-[240px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.observaciones ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { observaciones: e.target.value || null } as any)}
                      placeholder="Observaciones"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[200px]">
                    <textarea
                      className="min-h-[64px] w-[200px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.sancion ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { sancion: e.target.value || null })}
                      placeholder="Texto de sanción"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[120px]">
                    <input
                      type="number"
                      step="any"
                      className="w-[120px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.multa_estimada_usd ?? ""}
                      disabled={!canEditMatrix}
                      placeholder={String(estimateUsdFromSanction(r.sancion) ?? "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        void updateRow(r.id, {
                          multa_estimada_usd: v === "" ? null : Number(v)
                        });
                      }}
                    />
                    <div className="mt-1 text-[10px] text-charcoal/50">
                      Sug.: ${estimateUsdFromSanction(r.sancion) != null ? Number(estimateUsdFromSanction(r.sancion)).toLocaleString() : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    <input
                      className="w-[220px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.proceso_actividad_relacionada ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { proceso_actividad_relacionada: e.target.value || null } as any)}
                      placeholder="Proceso / actividad"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <input
                      className="w-[180px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.sponsor ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { sponsor: e.target.value || null } as any)}
                      placeholder="Gerencia responsable"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[200px]">
                    <input
                      className="w-[200px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                      value={r.responsable_proceso ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => void updateRow(r.id, { responsable_proceso: e.target.value || null } as any)}
                      placeholder="Jefatura responsable del proceso"
                    />
                  </td>
                  <td className="px-4 py-3 min-w-[240px]">
                    <div className="space-y-2">
                      <input
                        className="w-full rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                        placeholder="Pega link (Drive/Oficial) ..."
                        value={r.evidencia_url ?? ""}
                        disabled={!canEditMatrix}
                        onChange={(e) => void updateRow(r.id, { evidencia_url: e.target.value })}
                      />
                      <input
                        className="w-full rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                        placeholder="Link fuente oficial"
                        value={r.link_fuente_oficial ?? ""}
                        disabled={!canEditMatrix}
                        onChange={(e) => void updateRow(r.id, { link_fuente_oficial: e.target.value || null })}
                      />
                      <input
                        className="w-full rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                        placeholder="URL fuente verificada"
                        value={r.fuente_verificada_url ?? ""}
                        disabled={!canEditMatrix}
                        onChange={(e) => void updateRow(r.id, { fuente_verificada_url: e.target.value || null })}
                      />
                      {canDeleteFiles && r.evidencia_url ? (
                        <button
                          type="button"
                          className="w-full rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-borderSoft hover:bg-cream/70"
                          onClick={() => void deleteEvidenceFile(r.id, r.evidencia_url)}
                        >
                          Eliminar archivo (admin)
                        </button>
                      ) : null}
                      {r.normativa_doc_id && normas[r.normativa_doc_id] ? (
                        <div className="rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-borderSoft">
                          <div className="font-medium text-charcoal/80">Norma origen</div>
                          <div className="mt-1 text-[11px] text-charcoal/70">{normas[r.normativa_doc_id]?.titulo ?? "—"}</div>
                          <a
                            className="mt-2 inline-block text-[11px] text-sidebarRose underline"
                            href={normas[r.normativa_doc_id]?.fuente_url ?? r.fuente_verificada_url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver / descargar
                          </a>
                        </div>
                      ) : r.fuente_verificada_url ? (
                        <a className="text-xs text-sidebarRose underline" href={r.fuente_verificada_url} target="_blank" rel="noreferrer">
                          Ver / descargar (fuente verificada)
                        </a>
                      ) : null}
                      {r.fuente_verificada_url ? (
                        <a className="text-xs text-sidebarRose underline" href={r.fuente_verificada_url} target="_blank" rel="noreferrer">
                          Fuente verificada
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <div>
                        <div className="text-[11px] font-medium text-charcoal/70">Compliance</div>
                        <input
                          className="w-[190px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                          placeholder="Responsable compliance"
                          value={r.responsable ?? ""}
                          disabled={!canEditMatrix}
                          onChange={(e) => void updateRow(r.id, { responsable: e.target.value })}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-charcoal/70">Gerencia</div>
                        <input
                          className="w-[190px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                          placeholder="Gerencia a cargo"
                          value={r.gerencia_competente ?? ""}
                          disabled={!canEditMatrix}
                          onChange={(e) => void updateRow(r.id, { gerencia_competente: e.target.value || null })}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-charcoal/70">Jefatura</div>
                        <input
                          className="w-[190px] rounded-xl bg-cream px-3 py-2 text-xs ring-1 ring-borderSoft"
                          placeholder="Jefatura/área a cargo"
                          value={r.area_competente ?? ""}
                          disabled={!canEditMatrix}
                          onChange={(e) => void updateRow(r.id, { area_competente: e.target.value || null })}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="mb-2 w-full max-w-[140px] rounded-xl bg-cream px-2 py-1 text-xs ring-1 ring-borderSoft"
                      value={r.prioridad ?? ""}
                      disabled={!canEditMatrix}
                      onChange={(e) => {
                        const v = e.target.value;
                        void updateRow(r.id, {
                          prioridad: v === "" ? null : (v as Row["prioridad"])
                        });
                      }}
                    >
                      <option value="">Auto (reglas)</option>
                      <option value="critico">crítico</option>
                      <option value="alto">alto</option>
                      <option value="medio">medio</option>
                      <option value="bajo">bajo</option>
                    </select>
                    <div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ring-1 ${badgePrioridad(r.prioridad)}`}>
                        {r.prioridad ??
                          classifyPrioridad({
                            sancion: r.sancion,
                            multa_estimada_usd: r.multa_estimada_usd,
                            priorityScore: computePriorityScore(r.impacto_economico, r.probabilidad_incumplimiento)
                          })}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-[120px]">
                    {canAdminMatrix ? (
                      <button
                        type="button"
                        disabled={deletingRowId === r.id}
                        className="w-full rounded-xl border border-red-200 bg-red-50 px-2 py-2 text-[11px] font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                        onClick={() => void deleteMatrixRow(r.id)}
                      >
                        {deletingRowId === r.id ? "…" : "Eliminar fila"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-charcoal/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-charcoal/60" colSpan={19}>
                    Sin filas aún. Sube normativa en AI Notebook y aprueba propuestas.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-charcoal/60" colSpan={19}>
                    Cargando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Propuestas Pendientes (IA)</div>
            <div className="mt-1 text-xs text-charcoal/60">
              Indica si <strong>aplica</strong>, asigna <strong>gerencia</strong>, <strong>jefatura</strong> y <strong>supervisor legal</strong>. La aprobación a matriz la realizan{" "}
              <strong>admin o super admin</strong>. Si marcas «No aplica», no se podrá aprobar hasta corregirlo.
            </div>
          </div>
          <div className="text-xs text-charcoal/60">{propuestas.length} pendientes</div>
        </div>

        {iaPanel ? (
          <div className="mt-4 rounded-2xl border border-borderSoft bg-cream/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{iaPanel.titulo}</div>
              <button type="button" className="text-xs text-charcoal/60 underline" onClick={() => setIaPanel(null)}>
                Cerrar
              </button>
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-charcoal/90">{iaPanel.texto}</div>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {propuestas.map((p) => {
            const multa = p.multa_estimada_usd ?? estimateUsdFromSanction(p.sancion) ?? null;
            const score = computePriorityScore(p.impacto_economico, p.probabilidad_incumplimiento);
            const prioridad = p.prioridad ?? classifyPrioridad({ sancion: p.sancion, multa_estimada_usd: multa, priorityScore: score });
            const vig = esVigilancia(p.extra);
            return (
              <div
                key={p.id}
                className="rounded-2xl bg-cream/90 p-4 ring-1 ring-borderSoft shadow-sm transition hover:bg-cream hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold">{p.articulo}</div>
                      {vig ? (
                        <span className="rounded-full bg-sidebarRose/20 px-2 py-0.5 text-[11px] font-medium text-sidebarRose ring-1 ring-sidebarRose/30">
                          Vigilancia horaria
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm">{p.requisito}</div>
                    {vig && p.extra && typeof p.extra.alerta_contexto === "string" ? (
                      <div className="mt-1 text-xs text-charcoal/50">Contexto alerta: {p.extra.alerta_contexto}</div>
                    ) : null}
                    <div className="mt-2 text-xs text-charcoal/60">{p.cita_textual ?? "—"}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ring-1 ${badgeEstado(p.estado)}`}>{p.estado}</span>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ring-1 ${badgePrioridad(prioridad)}`}>{prioridad}</span>
                      <span className="inline-flex rounded-full bg-white px-2 py-1 text-xs ring-1 ring-borderSoft">
                        Multa: {multa ? `$${Number(multa).toLocaleString()}` : "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {p.fuente_verificada_url ? (
                        <a className="text-sidebarRose underline" href={p.fuente_verificada_url} target="_blank" rel="noreferrer">
                          Fuente verificada
                        </a>
                      ) : null}
                      {p.link_fuente_oficial ? (
                        <a className="text-sidebarRose underline" href={p.link_fuente_oficial} target="_blank" rel="noreferrer">
                          Link oficial
                        </a>
                      ) : null}
                      {p.normativa_doc_id ? (
                        <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-borderSoft">Doc memoria: {p.normativa_doc_id.slice(0, 8)}…</span>
                      ) : null}
                    </div>
                    {(p.gerencia_competente || p.area_competente) && (
                      <div className="mt-2 text-[11px] text-charcoal/55">
                        Sugerencia IA — Gerencia: {p.gerencia_competente ?? "—"} · Jefatura/área: {p.area_competente ?? "—"}
                      </div>
                    )}
                    <div
                      key={`triage-${p.id}-${p.updated_at ?? ""}`}
                      className="mt-4 grid gap-3 rounded-xl bg-white/70 p-3 ring-1 ring-borderSoft sm:grid-cols-2"
                    >
                      <label className="block text-xs">
                        <span className="font-medium text-charcoal">¿Aplica al negocio?</span>
                        <select
                          className="mt-1 w-full rounded-lg bg-cream px-2 py-1.5 ring-1 ring-borderSoft"
                          value={p.aplica_usuario === null || p.aplica_usuario === undefined ? "" : p.aplica_usuario ? "si" : "no"}
                          onChange={(e) => {
                            const v = e.target.value;
                            void patchPropuesta(p.id, {
                              aplica_usuario: v === "" ? null : v === "si"
                            });
                          }}
                        >
                          <option value="">— Pendiente —</option>
                          <option value="si">Sí aplica</option>
                          <option value="no">No aplica</option>
                        </select>
                      </label>
                      <label className="block text-xs">
                        <span className="font-medium text-charcoal">Supervisor legal (revisor)</span>
                        <select
                          className="mt-1 w-full rounded-lg bg-cream px-2 py-1.5 ring-1 ring-borderSoft"
                          value={p.supervisor_legal_id ?? ""}
                          onChange={(e) => void patchPropuesta(p.id, { supervisor_legal_id: e.target.value || null })}
                        >
                          <option value="">— Sin asignar —</option>
                          {assignable.map((u) => (
                            <option key={u.id} value={u.id}>
                              {(u.nombre || u.email || u.id).slice(0, 48)}
                              {u.email ? ` · ${u.email}` : ""}
                            </option>
                          ))}
                        </select>
                        {currentUserId ? (
                          <button
                            type="button"
                            className="mt-1 text-[11px] text-sidebarRose underline"
                            onClick={() => void patchPropuesta(p.id, { supervisor_legal_id: currentUserId })}
                          >
                            Asignarme a mí
                          </button>
                        ) : null}
                      </label>
                      <label className="block text-xs sm:col-span-1">
                        <span className="font-medium text-charcoal">Gerencia asignada</span>
                        <input
                          className="mt-1 w-full rounded-lg bg-cream px-2 py-1.5 ring-1 ring-borderSoft"
                          placeholder="Ej. Gerencia de Operaciones"
                          defaultValue={p.asignacion_gerencia ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (p.asignacion_gerencia ?? "")) void patchPropuesta(p.id, { asignacion_gerencia: v || null });
                          }}
                        />
                      </label>
                      <label className="block text-xs sm:col-span-1">
                        <span className="font-medium text-charcoal">Jefatura (dentro de gerencia)</span>
                        <input
                          className="mt-1 w-full rounded-lg bg-cream px-2 py-1.5 ring-1 ring-borderSoft"
                          placeholder="Ej. Jefatura de HSE"
                          defaultValue={p.asignacion_jefatura ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (p.asignacion_jefatura ?? "")) void patchPropuesta(p.id, { asignacion_jefatura: v || null });
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    {vig ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                          disabled={iaBusy === p.id}
                          onClick={() => void resumenPropuesta(p.id)}
                        >
                          {iaBusy === p.id ? "..." : "Resumen IA"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-borderSoft hover:bg-cream/70"
                          onClick={() => {
                            setQaPropuestaId(qaPropuestaId === p.id ? null : p.id);
                            setIaPanel(null);
                          }}
                        >
                          {qaPropuestaId === p.id ? "Ocultar pregunta" : "Preguntar a IA"}
                        </button>
                      </div>
                    ) : null}
                    {qaPropuestaId === p.id ? (
                      <div className="w-full max-w-md space-y-2 rounded-xl bg-white p-3 ring-1 ring-borderSoft">
                        <input
                          className="w-full rounded-lg bg-cream px-2 py-2 text-xs ring-1 ring-borderSoft"
                          placeholder="¿Deberíamos agregar esto a la matriz y por qué?"
                          value={qaPregunta}
                          onChange={(e) => setQaPregunta(e.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded-lg bg-charcoal px-3 py-1.5 text-xs font-medium text-cream shadow-sm hover:bg-charcoal/90 disabled:opacity-50"
                          disabled={iaBusy === p.id}
                          onClick={() => void preguntarPropuesta(p.id)}
                        >
                          Enviar pregunta
                        </button>
                      </div>
                    ) : null}
                    {canApprove ? (
                      <button
                        type="button"
                        className="rounded-xl bg-charcoal px-3 py-2 text-sm font-medium text-cream shadow-sm hover:bg-charcoal/90"
                        onClick={() => void approvePropuesta(p.id)}
                      >
                        Aprobar → matriz
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-xl border border-charcoal/15 bg-cream px-3 py-2 text-sm font-medium text-charcoal/50"
                        disabled
                      >
                        Aprobar (Super Admin)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {propuestas.length === 0 ? (
            <div className="rounded-xl bg-cream px-3 py-3 text-sm text-charcoal/70 ring-1 ring-borderSoft">
              No hay propuestas pendientes.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

