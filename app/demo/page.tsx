"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSelectedNegocioId } from "@/components/business/BusinessPicker";

const PASOS = [
  {
    min: "0–2",
    titulo: "Login y negocio",
    texto: "Inicia sesión. Ve a Negocios → crea o elige «Duragas» (o tu empresa demo).",
    href: "/negocios"
  },
  {
    min: "2–5",
    titulo: "AI Notebook — normativa",
    texto: "Marca 1 PDF en biblioteca → «Mapear empresa y generar sugerencias». Revisa que no haya error JSON.",
    href: "/ai-notebook"
  },
  {
    min: "5–8",
    titulo: "Matriz y propuestas",
    texto: "Ver negocio → propuestas pendientes: supervisor legal, gerencia, Aprobar → fila en matriz. Filtros por norma/organismo/responsable.",
    href: "/business"
  },
  {
    min: "8–10",
    titulo: "Procesos judiciales (demo)",
    texto: "Crear expediente sin número, resumen largo → Ficha IA → Aprobar. Pestaña Plazos: COGEP contestación. Notarías.",
    href: "/procesos"
  },
  {
    min: "10–12",
    titulo: "Notificaciones",
    texto: "Alertas de vigilancia y actualización normativa (ejecuta vigilancia abajo si está vacío).",
    href: "/notificaciones"
  },
  {
    min: "12–15",
    titulo: "Dashboard y export",
    texto: "Puntaje, riesgos, export CSV/PDF desde matriz.",
    href: "/dashboard"
  }
];

export default function DemoPage() {
  const [watcherMsg, setWatcherMsg] = useState<string | null>(null);
  const [watcherBusy, setWatcherBusy] = useState(false);

  async function runWatcher() {
    setWatcherBusy(true);
    setWatcherMsg(null);
    const negocioId = getSelectedNegocioId();
    try {
      const res = await fetch("/api/legal-watcher/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(negocioId ? { negocio_id: negocioId } : {})
      });
      const data = (await res.json()) as {
        message?: string;
        inserted_alertas?: number;
        inserted_propuestas?: number;
        throttled?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Error");
      setWatcherMsg(
        data.throttled
          ? data.message ?? "Vigilancia reciente (espera unos minutos)."
          : `Listo: ${data.inserted_alertas ?? 0} alerta(s), ${data.inserted_propuestas ?? 0} propuesta(s).`
      );
    } catch (e: unknown) {
      setWatcherMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setWatcherBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Guía demo (~15 minutos)</h1>
          <p className="mt-2 text-sm text-charcoal/70">
            LexControl AI — cumplimiento normativo + procesos judiciales (prototipo). Ten listos: Supabase, OpenAI y al menos un PDF con texto en biblioteca.
          </p>
        </div>

        <div className="rounded-2xl bg-sidebarRose/10 p-4 ring-1 ring-sidebarRose/30">
          <div className="text-sm font-medium text-charcoal">Antes de presentar</div>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-charcoal/80">
            <li>Variables en Vercel: <code className="text-xs">OPENAI_API_KEY</code>, Supabase URL/anon, service role si aplica.</li>
            <li>Negocio con sector y detalles (mejor mapeo IA).</li>
            <li>Usuario admin o super admin para aprobar propuestas.</li>
          </ul>
        </div>

        <ol className="space-y-3">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="rounded-2xl bg-white p-4 ring-1 ring-borderSoft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-sidebarRose">Paso {i + 1} · min {p.min}</span>
                  <div className="mt-1 font-medium">{p.titulo}</div>
                  <p className="mt-1 text-sm text-charcoal/70">{p.texto}</p>
                </div>
                <Link
                  className="shrink-0 rounded-xl bg-charcoal px-3 py-2 text-xs font-medium text-cream"
                  href={p.href === "/business" && getSelectedNegocioId() ? `/business/${getSelectedNegocioId()}` : p.href}
                >
                  Ir
                </Link>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-2xl bg-white p-4 ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Vigilancia legal (demo)</div>
          <p className="mt-1 text-xs text-charcoal/60">
            Genera alertas en Notificaciones según normativa reciente en base. En producción se ampliará a Registro Oficial y fuentes oficiales.
          </p>
          <button
            type="button"
            disabled={watcherBusy}
            className="mt-3 rounded-xl bg-charcoal px-4 py-2 text-sm font-medium text-cream disabled:opacity-50"
            onClick={() => void runWatcher()}
          >
            {watcherBusy ? "Ejecutando…" : "Ejecutar vigilancia ahora"}
          </button>
          {watcherMsg ? <p className="mt-2 text-sm text-charcoal/80">{watcherMsg}</p> : null}
        </div>
      </div>
    </AppShell>
  );
}
