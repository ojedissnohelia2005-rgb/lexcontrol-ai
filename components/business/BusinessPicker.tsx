"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Negocio } from "@/types/domain";

const STORAGE_KEY = "lexcontrol:selected_negocio_id";

export function getSelectedNegocioId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setSelectedNegocioId(id: string) {
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function BusinessPicker({
  onSelected
}: {
  onSelected?: (negocioId: string) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Negocio[]>([]);
  const [canAdmin, setCanAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [sector, setSector] = useState("");
  const [detalles, setDetalles] = useState("");
  const [rubroExtra, setRubroExtra] = useState(""); // opcional: más precisión IA

  async function load() {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const { data, error: e } = await supabase
        .from("negocios")
        .select("id,nombre,sector,puntaje_cumplimiento,responsable_id,detalles_negocio,created_at")
        .order("created_at", { ascending: false });
      if (e) throw e;
      setItems((data ?? []) as Negocio[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar negocios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  async function eliminarNegocio(id: string) {
    if (!supabase || !canAdmin) return;
    const ok = window.confirm(
      "Vas a eliminar este negocio y su matriz asociada (normativa, propuestas, actividades, etc.). Esta acción no se puede deshacer. ¿Continuar?"
    );
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/negocios/${id}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo eliminar el negocio");
      if (getSelectedNegocioId() === id) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error eliminando negocio");
    } finally {
      setDeletingId(null);
    }
  }

  async function create() {
    setError(null);
    setCreating(true);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) throw new Error("Sesión no válida");

      const fullDetails = [detalles.trim(), rubroExtra.trim() ? `Rubro (detalle opcional): ${rubroExtra.trim()}` : ""]
        .filter(Boolean)
        .join("\n");

      const { data, error: e } = await supabase
        .from("negocios")
        .insert({
          nombre: nombre.trim(),
          sector: sector.trim() || null,
          detalles_negocio: fullDetails || null,
          created_by: userData.user.id
        })
        .select("id")
        .single();
      if (e) throw e;

      setNombre("");
      setSector("");
      setDetalles("");
      setRubroExtra("");
      await load();

      if (data?.id) {
        setSelectedNegocioId(data.id);
        if (onSelected) onSelected(data.id);
        else window.location.href = `/business/${data.id}`;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo crear el negocio");
    } finally {
      setCreating(false);
    }
  }

  const selectedId = typeof window !== "undefined" ? getSelectedNegocioId() : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium tracking-widest text-charcoal/50">NEGOCIOS</div>
            <div className="mt-1 text-xl font-semibold">Crear / Seleccionar</div>
            <div className="mt-1 text-sm text-charcoal/60">
              Debes tener un negocio seleccionado para que el dashboard y la matriz funcionen.
            </div>
          </div>
          <Link className="rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70" href="/dashboard">
            Ir al Dashboard
          </Link>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium">Nombre *</div>
              <input
                className="mt-2 w-full rounded-xl bg-cream px-3 py-2 ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="PetroAndina S.A."
              />
            </label>
            <label className="block">
              <div className="text-sm font-medium">Sector</div>
              <input
                className="mt-2 w-full rounded-xl bg-cream px-3 py-2 ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Hidrocarburos"
              />
            </label>
          </div>
          <label className="block">
            <div className="text-sm font-medium">Detalles del negocio</div>
            <textarea
              className="mt-2 min-h-[96px] w-full rounded-xl bg-cream px-3 py-2 ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
              value={detalles}
              onChange={(e) => setDetalles(e.target.value)}
              placeholder="Empleados, ubicaciones, procesos críticos, reguladores, etc."
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">
              Descripción opcional del rubro (para precisión IA) <span className="text-xs text-charcoal/60">(opcional)</span>
            </div>
            <input
              className="mt-2 w-full rounded-xl bg-cream px-3 py-2 ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
              value={rubroExtra}
              onChange={(e) => setRubroExtra(e.target.value)}
              placeholder="Ej: operación upstream, químicos específicos, cadena de frío, etc."
            />
          </label>

          <button
            className="mt-1 w-full rounded-xl bg-sidebarRose px-3 py-2 text-sm font-medium text-cream hover:opacity-90 disabled:opacity-50"
            disabled={creating || !supabase || !nombre.trim()}
            onClick={() => void create()}
          >
            {creating ? "Creando..." : "Crear negocio"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Tus negocios</div>
          <button
            className="rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {items.length === 0 && !loading ? (
            <div className="rounded-xl bg-cream px-3 py-3 text-sm text-charcoal/70 ring-1 ring-borderSoft">
              Aún no tienes negocios creados.
            </div>
          ) : null}

          {items.map((n) => {
            const active = selectedId === n.id;
            const isDeleting = deletingId === n.id;
            return (
              <div
                key={n.id}
                className={[
                  "flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 transition",
                  active ? "bg-cream ring-roseOld" : "bg-white ring-borderSoft hover:bg-cream/40"
                ].join(" ")}
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    setSelectedNegocioId(n.id);
                    if (onSelected) onSelected(n.id);
                    else window.location.href = `/business/${n.id}`;
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{n.nombre}</div>
                      <div className="mt-1 text-xs text-charcoal/60">{n.sector ?? "—"}</div>
                    </div>
                    <div className="text-xs text-charcoal/60">{active ? "Seleccionado" : "Seleccionar"}</div>
                  </div>
                </button>
                {canAdmin ? (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void eliminarNegocio(n.id)}
                    className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs text-red-700 ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                  >
                    {isDeleting ? "Eliminando…" : "Eliminar"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

