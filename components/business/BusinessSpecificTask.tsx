"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Actividad = {
  id: string;
  nombre: string;
};

export function BusinessSpecificTask({ negocioId }: { negocioId: string }) {
  const [tarea, setTarea] = useState("");
  const [actividadId, setActividadId] = useState<string | "">("");
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "warn">("ok");
  const [error, setError] = useState<string | null>(null);

  const loadActividades = useCallback(async () => {
    if (!negocioId) return;
    try {
      const res = await fetch(`/api/negocios/${negocioId}/actividades`, { credentials: "include" });
      const data = (await res.json()) as { actividades?: { id: string; nombre: string }[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se cargaron actividades");
      setActividades(data.actividades ?? []);
    } catch (e: unknown) {
      console.error(e);
      setActividades([]);
    }
  }, [negocioId]);

  useEffect(() => {
    void loadActividades();
  }, [loadActividades]);

  async function enviarTarea() {
    if (!tarea.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    setMsgTone("ok");
    try {
      const res = await fetch(`/api/negocios/${negocioId}/tarea-especifica`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          descripcion: tarea.trim(),
          actividad_id: actividadId || undefined
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        items_generados?: number;
        error?: string;
        aviso?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo generar propuestas");
      const n = data.items_generados ?? 0;
      setMsgTone(n > 0 ? "ok" : "warn");
      setMsg(
        n > 0
          ? `Listo: la IA generó ${n} propuesta(s) en Propuestas pendientes para esta tarea.`
          : (data.aviso ??
            "La IA no generó ítems. Detalla más la tarea o sube normativa relevante (p. ej. Código del Trabajo) en AI Notebook.")
      );
      setTarea("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Tarea específica para la IA</div>
          <div className="mt-1 text-xs text-charcoal/60">
            Describe un escenario concreto. La IA <strong>prioriza</strong> lo que haya en los PDFs de la biblioteca; si no alcanza, propone con su conocimiento
            (p. ej. laboral) y lo deja marcado como <strong>no respaldado en biblioteca</strong> para que verifiques en fuente oficial.
          </div>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}
      {msg ? (
        <div
          className={cn(
            "mt-3 rounded-xl px-3 py-2 text-xs ring-1",
            msgTone === "ok"
              ? "bg-green-50 text-green-900 ring-green-200"
              : "bg-amber-50 text-amber-950 ring-amber-200"
          )}
        >
          {msg}
        </div>
      ) : null}

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

