"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { MarkdownGuide } from "@/components/MarkdownGuide";

type NegocioRow = {
  id: string;
  nombre: string;
  sector: string | null;
  detalles_negocio: string | null;
  regulacion_actividades_especiales: string | null;
  normativa_actualizar_nota: string | null;
  normativa_actualizar_urls: string | null;
  guia_fuentes_ia: string | null;
  clave_registro?: string | null;
};

export function RubroYRegulacionPanel({ negocioId }: { negocioId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [row, setRow] = useState<NegocioRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guiaBusy, setGuiaBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guiaPreview, setGuiaPreview] = useState<string | null>(null);
  const [canAdmin, setCanAdmin] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [regulacion, setRegulacion] = useState("");
  const [notaActualizar, setNotaActualizar] = useState("");
  const [urlsActualizar, setUrlsActualizar] = useState("");
  const [claveRegistro, setClaveRegistro] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("negocios")
        .select(
          "id,nombre,sector,detalles_negocio,regulacion_actividades_especiales,normativa_actualizar_nota,normativa_actualizar_urls,guia_fuentes_ia,clave_registro"
        )
        .eq("id", negocioId)
        .single();
      if (e) throw e;
      const n = data as NegocioRow;
      setRow(n);
      setRegulacion(n.regulacion_actividades_especiales ?? "");
      setNotaActualizar(n.normativa_actualizar_nota ?? "");
      setUrlsActualizar(n.normativa_actualizar_urls ?? "");
      setGuiaPreview(n.guia_fuentes_ia ?? null);
      setClaveRegistro(n.clave_registro ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar negocio");
    } finally {
      setLoading(false);
    }
  }, [supabase, negocioId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return setCanAdmin(false);
      const { data: p } = await supabase.from("profiles").select("rol").eq("id", uid).maybeSingle();
      const r = String((p as { rol?: string } | null)?.rol ?? "");
      setCanAdmin(r === "admin" || r === "super_admin");
    });
  }, [supabase]);

  async function guardarCampos() {
    if (!supabase) return;
    if (!canAdmin) {
      setError("Solo admin / super admin puede editar estos campos.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { error: e } = await supabase
        .from("negocios")
        .update({
          regulacion_actividades_especiales: regulacion.trim() || null,
          normativa_actualizar_nota: notaActualizar.trim() || null,
          normativa_actualizar_urls: urlsActualizar.trim() || null
        })
        .eq("id", negocioId);
      if (e) throw e;
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function generarGuia(guardar: boolean) {
    setError(null);
    setGuiaBusy(true);
    setGuiaPreview(null);
    try {
      const res = await fetch("/api/gemini/rubro-guia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ negocio_id: negocioId, guardar })
      });
      const data = (await res.json()) as { guia?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error en guía IA");
      setGuiaPreview(data.guia ?? "");
      if (guardar) await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuiaBusy(false);
    }
  }

  async function eliminarGuia() {
    setError(null);
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/negocios/guia/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ negocio_id: negocioId })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo eliminar");
      setGuiaPreview(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!supabase) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
        <div className="text-sm text-charcoal/60">Configura Supabase para editar el contexto del negocio.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Rubro, actividades y normativa a vigilar</div>
          <div className="mt-1 text-xs text-charcoal/60">
            Describe regulaciones especiales y qué normativa crees que debe actualizarse. La IA genera una guía de dónde buscar (fuentes oficiales, palabras clave,
            pasos).
          </div>
        </div>
        {row ? (
          <div className="text-xs text-charcoal/60">
            {row.nombre}
            {row.sector ? ` · ${row.sector}` : ""}
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}

      {loading ? (
        <div className="mt-4 text-sm text-charcoal/60">Cargando...</div>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="block">
            <div className="text-sm font-medium">Actividades y regulación especial</div>
            <div className="mt-1 text-xs text-charcoal/60">
              Ej.: manejo de sustancias, transporte, datos personales, contratos estatales, residuos, etc.
            </div>
            <textarea
              className="mt-2 min-h-[100px] w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld disabled:opacity-60"
              value={regulacion}
              onChange={(e) => setRegulacion(e.target.value)}
              placeholder="Detalle lo que quieres que la IA tenga en cuenta al orientar búsquedas normativas..."
              disabled={!canAdmin}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium">Normativa que requiere actualización (información para el sistema)</div>
            <div className="mt-1 text-xs text-charcoal/60">
              Texto libre: qué norma o tema crees desactualizado y qué hipótesis tienes. Luego sube el PDF en AI Notebook o pega links abajo.
            </div>
            <textarea
              className="mt-2 min-h-[88px] w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld disabled:opacity-60"
              value={notaActualizar}
              onChange={(e) => setNotaActualizar(e.target.value)}
              placeholder="Ej.: posible reforma al reglamento X; dudas sobre SBU en sanciones del sector..."
              disabled={!canAdmin}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium">Enlaces (Drive, Registro Oficial, PDFs)</div>
            <textarea
              className="mt-2 min-h-[64px] w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld disabled:opacity-60"
              value={urlsActualizar}
              onChange={(e) => setUrlsActualizar(e.target.value)}
              placeholder="Un enlace por línea..."
              disabled={!canAdmin}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !canAdmin}
              className="rounded-xl bg-sidebarRose px-4 py-2 text-sm font-medium text-cream hover:opacity-90 disabled:opacity-50"
              onClick={() => void guardarCampos()}
            >
              {saving ? "Guardando..." : "Guardar campos"}
            </button>
            <button
              type="button"
              disabled={guiaBusy}
              className="rounded-xl bg-cream px-4 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
              onClick={() => void generarGuia(false)}
            >
              {guiaBusy ? "Generando..." : "Vista previa guía IA"}
            </button>
            <button
              type="button"
              disabled={guiaBusy}
              className="rounded-xl bg-cream px-4 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
              onClick={() => void generarGuia(true)}
            >
              Generar y guardar guía
            </button>
            {canAdmin && (guiaPreview ?? row?.guia_fuentes_ia) ? (
              <button
                type="button"
                disabled={deleteBusy}
                className="rounded-xl bg-white px-4 py-2 text-sm text-red-700 ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                onClick={() => void eliminarGuia()}
              >
                {deleteBusy ? "Eliminando..." : "Eliminar guía IA"}
              </button>
            ) : null}
            {canAdmin ? (
              <button
                type="button"
                className="rounded-xl bg-white px-4 py-2 text-sm text-charcoal ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/negocios/${negocioId}/registro-clave`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ regenerate: true })
                    });
                    const data = (await res.json()) as { ok?: boolean; clave_registro?: string; error?: string };
                    if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo generar clave");
                    setClaveRegistro(data.clave_registro ?? null);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : "Error generando clave");
                  }
                }}
              >
                {claveRegistro ? "Regenerar clave de registro" : "Generar clave de registro"}
              </button>
            ) : null}
          </div>

          {claveRegistro ? (
            <div className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/80 ring-1 ring-borderSoft">
              <div className="font-medium text-charcoal">Clave de registro activa</div>
              <div className="mt-1 font-mono text-sm">{claveRegistro}</div>
              <div className="mt-1 text-[11px] text-charcoal/60">
                Compártela solo con usuarios que deban registrarse a este negocio. Tras un uso correcto, se invalidará y podrás generar otra.
              </div>
            </div>
          ) : (
            canAdmin && (
              <div className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/60 ring-1 ring-borderSoft">
                No hay clave de registro activa. Genera una para permitir que nuevos usuarios se adhieran a este negocio.
              </div>
            )
          )}

          {(guiaPreview ?? row?.guia_fuentes_ia) ? (
            <div className="rounded-2xl bg-cream px-5 py-5 ring-1 ring-borderSoft">
              <div className="text-xs font-medium uppercase tracking-wide text-sidebarRose">Guía normativa (IA)</div>
              <div className="mt-3">
                <MarkdownGuide markdown={(guiaPreview ?? row?.guia_fuentes_ia) as string} />
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/60 ring-1 ring-borderSoft">
              Aún no hay guía guardada. Usa “Vista previa” o “Generar y guardar”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
