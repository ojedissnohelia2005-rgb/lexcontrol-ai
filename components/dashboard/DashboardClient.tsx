"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getSelectedNegocioId } from "@/components/business/BusinessPicker";
import { BarsEstado, DonutScore } from "@/components/dashboard/charts";

type MatrizRow = {
  id: string;
  estado: "cumplido" | "pendiente" | "no_aplica" | "en_proceso";
  prioridad: "critico" | "alto" | "medio" | "bajo" | null;
  articulo: string;
  requisito: string;
  sancion: string | null;
  multa_estimada_usd: number | null;
  responsable: string | null;
};

function estadoColor(estado: string) {
  if (estado === "cumplido") return "#4FBF8B";
  if (estado === "en_proceso") return "#3B82F6";
  if (estado === "pendiente") return "#F59E0B";
  return "#A3A3A3";
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

export function DashboardClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MatrizRow[]>([]);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  async function load(id: string) {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const { data, error: e } = await supabase
        .from("matriz_cumplimiento")
        .select("id,estado,prioridad,articulo,requisito,sancion,multa_estimada_usd,responsable")
        .eq("negocio_id", id)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (e) throw e;
      setRows((data ?? []) as MatrizRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la matriz");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = getSelectedNegocioId();
    setNegocioId(id);
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data }) => setSessionEmail(data.user?.email ?? null));
    if (!id) {
      setLoading(false);
      return;
    }
    void load(id);

    // realtime refresh (best-effort)
    const channel = supabase
      .channel("matriz-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matriz_cumplimiento", filter: `negocio_id=eq.${id}` },
        () => void load(id)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (!supabase) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
        <div className="text-lg font-semibold">Configura Supabase</div>
        <div className="mt-1 text-sm text-charcoal/60">
          Falta <span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span> y <span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> en <span className="font-medium">.env.local</span>.
        </div>
      </div>
    );
  }

  if (!negocioId) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
        <div className="text-lg font-semibold">Selecciona un negocio</div>
        <div className="mt-1 text-sm text-charcoal/60">
          Para ver tu dashboard y matriz, primero crea o selecciona un negocio.
        </div>
        <Link className="mt-4 inline-flex rounded-xl bg-sidebarRose px-4 py-2 text-sm font-medium text-cream" href="/negocios">
          Ir a Negocios
        </Link>
      </div>
    );
  }

  const total = rows.length || 1;
  const cumplidos = rows.filter((r) => r.estado === "cumplido").length;
  const score = Math.round((cumplidos / total) * 100);

  const estadoCounts = ["cumplido", "en_proceso", "pendiente", "no_aplica"].map((estado) => ({
    estado,
    count: rows.filter((r) => r.estado === (estado as MatrizRow["estado"])).length,
    color: estadoColor(estado)
  }));

  const topRiesgos = rows
    .filter((r) => r.prioridad === "critico" || r.prioridad === "alto")
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Dashboard</div>
          <div className="mt-1 text-sm text-charcoal/60">Widgets de matriz resumida y riesgos.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-xl bg-white px-4 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70" href="/ai-notebook">
            Subir Normativa PDF
          </Link>
          <Link className="rounded-xl bg-white px-4 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70" href="/ai-notebook">
            Generar Matriz de Riesgo
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Puntaje General</div>
              <div className="mt-1 text-xs text-charcoal/60">{loading ? "Cargando..." : `Basado en ${rows.length} requisitos`}</div>
            </div>
            <div className="rounded-xl bg-cream px-3 py-1 text-xs ring-1 ring-borderSoft">Ecuador</div>
          </div>
          <div className="mt-4">
            <DonutScore value={loading ? 0 : score} />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Resumen por Estado</div>
              <div className="mt-1 text-xs text-charcoal/60">Distribución de cumplimiento</div>
            </div>
          </div>
          <div className="mt-4">
            <BarsEstado data={estadoCounts} />
          </div>
        </div>

        <div />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Top 5 Riesgos Críticos</div>
            <div className="mt-1 text-xs text-charcoal/60">Priorización automática (crítico/alto).</div>
          </div>
          <Link className="rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70" href={`/business/${negocioId}`}>
            Ver negocio
          </Link>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-borderSoft">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream">
              <tr className="text-xs text-charcoal/70">
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Artículo</th>
                <th className="px-4 py-3">Requisito</th>
                <th className="px-4 py-3">Sanción</th>
                <th className="px-4 py-3">Multa Estimada</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {(loading ? [] : topRiesgos).map((r) => (
                <tr key={r.id} className="border-t border-borderSoft">
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs ring-1 ${badgeEstado(r.estado)}`}>{r.estado}</span>
                  </td>
                  <td className="px-4 py-3">{r.articulo}</td>
                  <td className="px-4 py-3">{r.requisito}</td>
                  <td className="px-4 py-3">{r.sancion ?? "—"}</td>
                  <td className="px-4 py-3">{r.multa_estimada_usd ? `$${Number(r.multa_estimada_usd).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3">{r.responsable ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs ring-1 ${badgePrioridad(r.prioridad)}`}>
                      {r.prioridad ?? "bajo"}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && topRiesgos.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-charcoal/60" colSpan={7}>
                    Aún no hay riesgos críticos/altos. Sube normativa en AI Notebook para poblar la matriz.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-charcoal/60" colSpan={7}>
                    Cargando datos...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

