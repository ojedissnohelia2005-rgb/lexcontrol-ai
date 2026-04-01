"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Actividad = {
  id: string;
  nombre: string;
};

export function BusinessSpecificTask({ negocioId }: { negocioId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tarea, setTarea] = useState("");
  const [actividadId, setActividadId] = useState<string | "">("");
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !negocioId) return;
    supabase
      .from("negocio_actividades")
      .select("id,nombre")
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        setActividades((data ?? []) as Actividad[]);
      });
  }, [supabase, negocioId]);

  async function enviarTarea() {
    if (!tarea.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/negocios/${negocioId}/tarea-especifica`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          descripcion: tarea.trim(),
          actividad_id: actividadId || undefined
        })
      });
      const data = (await res.json()) as { ok?: boolean; items_generados?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo generar propuestas");
      setMsg(`Listo: la IA generó ${data.items_generados ?? 0} propuesta(s) en la matriz para esta tarea.`);
      setTarea("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (!supabase) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Tarea específica para la IA</div>
          <div className="mt-1 text-xs text-charcoal/60">
            Describe un escenario o proceso muy concreto que no quedó claro en la descripción general. La IA usará la normativa en memoria de este negocio para
            proponer nuevos requisitos en la matriz.
          </div>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}
      {msg ? <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-900 ring-1 ring-green-200">{msg}</div> : null}

      <div className="mt-4 space-y-3">
        <textarea
          value={tarea}
          onChange={(e) => setTarea(e.target.value)}
          className="min-h-[110px] w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
          placeholder="Ej.: Operación puntual de traslado de GLP en camiones tercerizados a una provincia donde normalmente no operamos; quiero que la matriz cubra esta situación específica..."
        />

        <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <div className="text-xs font-medium text-charcoal/80">Vincular (opcional) a una actividad</div>
            <select
              className="mt-1 w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
              value={actividadId}
              onChange={(e) => setActividadId(e.target.value)}
            >
              <option value="">— Sin actividad específica —</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={busy || !tarea.trim()}
              onClick={() => void enviarTarea()}
              className="w-full rounded-xl bg-sidebarRose px-4 py-2 text-sm font-medium text-cream disabled:opacity-50"
            >
              {busy ? "Generando propuestas…" : "Generar propuestas para la matriz"}
            </button>
          </div>
        </div>

        <div className="text-[11px] text-charcoal/60">
          Las filas generadas aparecen en <span className="font-semibold">Propuestas pendientes</span> del negocio, marcadas como origen “tarea específica”.
        </div>
      </div>
    </div>
  );
}

