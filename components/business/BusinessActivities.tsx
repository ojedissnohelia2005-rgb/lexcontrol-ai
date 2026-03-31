"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Actividad = {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_at: string;
};

export function BusinessActivities({ negocioId }: { negocioId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<Actividad[]>([]);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !negocioId) return;
    supabase
      .from("negocio_actividades")
      .select("id,nombre,descripcion,created_at")
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setItems((data ?? []) as Actividad[]));
  }, [supabase, negocioId]);

  async function crearActividad() {
    if (!supabase || !negocioId || !nombre.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/negocios/${negocioId}/actividades`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined })
      });
      const data = (await res.json()) as { actividad?: Actividad; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo crear la actividad");
      setItems((prev) => [...prev, data.actividad!]);
      setNombre("");
      setDescripcion("");
    } catch (e) {
      console.error(e);
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
          {items.length === 0 ? (
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

