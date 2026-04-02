"use client";

import { useCallback, useEffect, useState } from "react";

type Actividad = {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_at: string;
};

export function BusinessActivities({ negocioId }: { negocioId: string }) {
  const [items, setItems] = useState<Actividad[]>([]);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActividades = useCallback(async () => {
    if (!negocioId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/negocios/${negocioId}/actividades`, { credentials: "include" });
      const raw = await res.text();
      let data: { actividades?: Actividad[]; error?: string };
      try {
        data = JSON.parse(raw) as { actividades?: Actividad[]; error?: string };
      } catch {
        throw new Error(raw.slice(0, 220) || `Respuesta inválida (${res.status})`);
      }
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudieron cargar las actividades");
      setItems(data.actividades ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [negocioId]);

  useEffect(() => {
    void loadActividades();
  }, [loadActividades]);

  async function crearActividad() {
    if (!negocioId || !nombre.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/negocios/${negocioId}/actividades`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined })
      });
      const raw = await res.text();
      let data: { actividad?: Actividad; error?: string };
      try {
        data = JSON.parse(raw) as { actividad?: Actividad; error?: string };
      } catch {
        throw new Error(raw.slice(0, 220) || `Respuesta inválida (${res.status})`);
      }
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo crear la actividad");
      if (!data.actividad) throw new Error("El servidor no devolvió la actividad creada");
      setItems((prev) => [...prev, data.actividad!]);
      setNombre("");
      setDescripcion("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Actividades específicas del negocio</div>
          <div className="mt-1 text-xs text-charcoal/60">
            Define actividades o procesos concretos (por ejemplo, “Transporte de GLP a granel”) para enfocar el cumplimiento.
          </div>
        </div>
      </div>
      {error ? (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2">
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la actividad"
            className="w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
          />
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción breve (opcional)"
            className="h-20 w-full resize-none rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
          />
          <button
            type="button"
            disabled={saving || !nombre.trim()}
            onClick={() => void crearActividad()}
            className="mt-1 w-full rounded-xl bg-sidebarRose px-4 py-2 text-sm font-medium text-cream disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Agregar actividad"}
          </button>
        </div>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-cream p-3 ring-1 ring-borderSoft">
          {loading ? (
            <div className="text-xs text-charcoal/70">Cargando actividades…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-charcoal/70">Aún no hay actividades registradas para este negocio.</div>
          ) : (
            items.map((a) => (
              <div key={a.id} className="rounded-lg bg-white px-3 py-2 text-xs text-charcoal/80 ring-1 ring-borderSoft">
                <div className="font-semibold text-charcoal">{a.nombre}</div>
                {a.descripcion ? <div className="mt-1 text-[11px] text-charcoal/70">{a.descripcion}</div> : null}
                <div className="mt-1 text-[10px] text-charcoal/50">
                  Creada el {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

