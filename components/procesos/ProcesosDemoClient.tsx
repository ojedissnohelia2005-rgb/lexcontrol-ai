"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSelectedNegocioId } from "@/components/business/BusinessPicker";
import { NOTARIAS_DEMO } from "@/lib/notarias-demo";
import { PROCEDIMIENTOS_PLAZO, type MateriaPlazo } from "@/lib/plazos-ecuador-demo";

type ProcesoLocal = {
  id: string;
  numero: string;
  resumen: string;
  abogado: string;
  materia: MateriaPlazo;
  ficha?: Record<string, unknown> | null;
  fichaEstado?: "borrador" | "aprobada" | "rechazada" | "pendiente";
  etapas: { id: string; tipo: string; fecha: string; resumen: string }[];
};

const STORAGE_KEY = "lexcontrol_procesos_demo";

function loadProcesos(negocioId: string): ProcesoLocal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${negocioId}`);
    return raw ? (JSON.parse(raw) as ProcesoLocal[]) : [];
  } catch {
    return [];
  }
}

function saveProcesos(negocioId: string, list: ProcesoLocal[]) {
  localStorage.setItem(`${STORAGE_KEY}:${negocioId}`, JSON.stringify(list));
}

export function ProcesosDemoClient() {
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [tab, setTab] = useState<"procesos" | "plazos" | "notarias">("procesos");
  const [procesos, setProcesos] = useState<ProcesoLocal[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [nuevoNum, setNuevoNum] = useState("");
  const [nuevoResumen, setNuevoResumen] = useState("");
  const [nuevoAbogado, setNuevoAbogado] = useState("");
  const [nuevaMateria, setNuevaMateria] = useState<MateriaPlazo>("cogep");

  const [plazoMateria, setPlazoMateria] = useState<MateriaPlazo>("cogep");
  const [plazoProc, setPlazoProc] = useState("cogep-contestacion");
  const [plazoInicio, setPlazoInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [plazoResult, setPlazoResult] = useState<Record<string, unknown> | null>(null);

  const [notariaSel, setNotariaSel] = useState(NOTARIAS_DEMO[0]!.id);

  const sel = useMemo(() => procesos.find((p) => p.id === selId) ?? null, [procesos, selId]);
  const procsFiltrados = useMemo(
    () => PROCEDIMIENTOS_PLAZO.filter((p) => p.materiasOk.includes(plazoMateria)),
    [plazoMateria]
  );

  useEffect(() => {
    const id = getSelectedNegocioId();
    setNegocioId(id);
    if (id) {
      const list = loadProcesos(id);
      setProcesos(list);
      setSelId(list[0]?.id ?? null);
    }
  }, []);

  function persist(list: ProcesoLocal[]) {
    if (!negocioId) return;
    setProcesos(list);
    saveProcesos(negocioId, list);
  }

  function crearProceso() {
    if (!negocioId) {
      setError("Selecciona un negocio en Negocios primero.");
      return;
    }
    const num =
      nuevoNum.trim() ||
      `Proceso sin asignar #${procesos.filter((p) => p.numero.includes("sin asignar")).length + 1}`;
    const p: ProcesoLocal = {
      id: crypto.randomUUID(),
      numero: num,
      resumen: nuevoResumen.trim() || "—",
      abogado: nuevoAbogado.trim() || "Sin asignar",
      materia: nuevaMateria,
      etapas: [],
      fichaEstado: undefined
    };
    const list = [p, ...procesos];
    persist(list);
    setSelId(p.id);
    setNuevoNum("");
    setNuevoResumen("");
    setError(null);
  }

  async function generarFicha() {
    if (!sel) return;
    if ((sel.resumen?.length ?? 0) < 80) {
      setError("Escribe al menos 80 caracteres en el resumen del caso para la ficha IA.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/procesos/ficha-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          numero_proceso: sel.numero,
          resumen_caso: sel.resumen,
          materia: sel.materia
        })
      });
      const data = (await res.json()) as { ok?: boolean; ficha?: Record<string, unknown>; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error");
      const list = procesos.map((p) =>
        p.id === sel.id ? { ...p, ficha: data.ficha ?? null, fichaEstado: "pendiente" as const } : p
      );
      persist(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function aprobarFicha(aprobada: boolean) {
    if (!sel) return;
    const list = procesos.map((p) =>
      p.id === sel.id ? { ...p, fichaEstado: aprobada ? ("aprobada" as const) : ("rechazada" as const) } : p
    );
    persist(list);
  }

  async function calcularPlazo() {
    setBusy(true);
    setError(null);
    setPlazoResult(null);
    try {
      const res = await fetch("/api/plazos/calcular", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          materia: plazoMateria,
          procedimiento_id: plazoProc,
          fecha_inicio: plazoInicio
        })
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error ?? "Error"));
      setPlazoResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const notaria = NOTARIAS_DEMO.find((n) => n.id === notariaSel) ?? NOTARIAS_DEMO[0]!;

  if (!negocioId) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-borderSoft">
        <div className="text-lg font-semibold">Selecciona un negocio</div>
        <p className="mt-2 text-sm text-charcoal/60">Los procesos demo se guardan por empresa en este navegador.</p>
        <Link className="mt-4 inline-block rounded-xl bg-sidebarRose px-4 py-2 text-sm text-cream" href="/negocios">
          Ir a Negocios
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
        <strong>Demo judicial:</strong> datos en este navegador. Producción: Supabase + SATJE + aprobaciones formales.
      </div>

      <div className="flex flex-wrap gap-2">
        {(["procesos", "plazos", "notarias"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-medium ring-1 ${
              tab === t ? "bg-charcoal text-cream ring-charcoal" : "bg-white text-charcoal ring-borderSoft"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "procesos" ? "Expedientes" : t === "plazos" ? "Plazos y términos" : "Notarías"}
          </button>
        ))}
        <Link className="ml-auto rounded-xl border border-charcoal/15 bg-white px-3 py-2 text-sm hover:bg-cream" href="/demo">
          Guía demo 15 min
        </Link>
      </div>

      {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}

      {tab === "procesos" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-borderSoft">
            <div className="text-sm font-medium">Nuevo expediente</div>
            <input
              className="w-full rounded-lg bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
              placeholder="Nº proceso o vacío → sin asignar #n"
              value={nuevoNum}
              onChange={(e) => setNuevoNum(e.target.value)}
            />
            <select
              className="w-full rounded-lg bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
              value={nuevaMateria}
              onChange={(e) => setNuevaMateria(e.target.value as MateriaPlazo)}
            >
              <option value="cogep">COGEP</option>
              <option value="civil">Civil</option>
              <option value="administrativo">Administrativo</option>
              <option value="penal">Penal (COIP)</option>
            </select>
            <input
              className="w-full rounded-lg bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
              placeholder="Abogado a cargo"
              value={nuevoAbogado}
              onChange={(e) => setNuevoAbogado(e.target.value)}
            />
            <textarea
              className="min-h-[100px] w-full rounded-lg bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
              placeholder="Resumen del caso (mín. 80 caracteres para ficha IA)…"
              value={nuevoResumen}
              onChange={(e) => setNuevoResumen(e.target.value)}
            />
            <button
              type="button"
              className="w-full rounded-xl bg-charcoal py-2 text-sm font-medium text-cream"
              onClick={crearProceso}
            >
              Crear proceso
            </button>
            <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
              {procesos.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-left ring-1 ${
                      selId === p.id ? "bg-cream ring-sidebarRose" : "bg-white ring-borderSoft"
                    }`}
                    onClick={() => setSelId(p.id)}
                  >
                    <div className="font-medium">{p.numero}</div>
                    <div className="text-xs text-charcoal/60">{p.abogado} · {p.materia.toUpperCase()}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-borderSoft">
            {sel ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">{sel.numero}</div>
                <p className="text-xs text-charcoal/70 whitespace-pre-wrap">{sel.resumen}</p>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl bg-sidebarRose px-4 py-2 text-sm font-medium text-cream disabled:opacity-50"
                  onClick={() => void generarFicha()}
                >
                  {busy ? "IA…" : "Generar ficha del caso (IA)"}
                </button>
                {sel.ficha ? (
                  <div className="rounded-xl bg-cream/80 p-3 text-xs ring-1 ring-borderSoft">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(sel.ficha, null, 2)}</pre>
                    {sel.fichaEstado === "pendiente" ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-green-700 px-3 py-1 text-cream"
                          onClick={() => aprobarFicha(true)}
                        >
                          Aprobar ficha
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-red-700 px-3 py-1 text-cream"
                          onClick={() => aprobarFicha(false)}
                        >
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 font-medium">Estado: {sel.fichaEstado}</div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-charcoal/60">Crea o selecciona un proceso.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "plazos" ? (
        <div className="max-w-lg rounded-2xl bg-white p-6 ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Calculadora de plazos (demo)</div>
          <p className="mt-1 text-xs text-charcoal/60">
            Contrasta materia vs trámite. Si hay anomalía, se alerta al abogado antes de fijar fecha.
          </p>
          <label className="mt-4 block text-xs">
            Materia
            <select
              className="mt-1 w-full rounded-lg bg-cream px-2 py-2 ring-1 ring-borderSoft"
              value={plazoMateria}
              onChange={(e) => {
                setPlazoMateria(e.target.value as MateriaPlazo);
                const first = PROCEDIMIENTOS_PLAZO.find((p) => p.materiasOk.includes(e.target.value as MateriaPlazo));
                if (first) setPlazoProc(first.id);
              }}
            >
              <option value="cogep">COGEP</option>
              <option value="civil">Civil</option>
              <option value="administrativo">Administrativo</option>
              <option value="penal">Penal</option>
            </select>
          </label>
          <label className="mt-3 block text-xs">
            Trámite
            <select
              className="mt-1 w-full rounded-lg bg-cream px-2 py-2 ring-1 ring-borderSoft"
              value={plazoProc}
              onChange={(e) => setPlazoProc(e.target.value)}
            >
              {procsFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs">
            Fecha inicio
            <input
              type="date"
              className="mt-1 w-full rounded-lg bg-cream px-2 py-2 ring-1 ring-borderSoft"
              value={plazoInicio}
              onChange={(e) => setPlazoInicio(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            className="mt-4 w-full rounded-xl bg-charcoal py-2 text-sm font-medium text-cream disabled:opacity-50"
            onClick={() => void calcularPlazo()}
          >
            Calcular plazo
          </button>
          {plazoResult ? (
            <div
              className={`mt-4 rounded-xl p-3 text-sm ring-1 ${
                plazoResult.notificarAbogado ? "bg-red-50 ring-red-200 text-red-900" : "bg-green-50 ring-green-200 text-green-900"
              }`}
            >
              <div>{String(plazoResult.mensaje)}</div>
              {plazoResult.fechaLimite ? (
                <div className="mt-2 font-semibold">Fecha límite estimada: {String(plazoResult.fechaLimite)}</div>
              ) : null}
              <div className="mt-1 text-xs opacity-80">{String(plazoResult.baseLegal)}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "notarias" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-borderSoft">
            <div className="text-sm font-medium">Notarías (demo Ecuador)</div>
            <ul className="mt-3 space-y-2">
              {NOTARIAS_DEMO.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ring-1 ${
                      notariaSel === n.id ? "bg-cream ring-sidebarRose" : "ring-borderSoft"
                    }`}
                    onClick={() => setNotariaSel(n.id)}
                  >
                    {n.nombre} — {n.ciudad}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-borderSoft">
            <div className="font-medium">{notaria.nombre}</div>
            <div className="mt-2 text-sm text-charcoal/70">{notaria.direccion}</div>
            <div className="mt-2 text-sm">
              <span className="font-medium">Horarios:</span> {notaria.horarios}
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">Abogado titular:</span> {notaria.abogadoTitular}
            </div>
            <a
              className="mt-4 inline-block text-sm text-sidebarRose underline"
              href={`https://www.openstreetmap.org/?mlat=${notaria.lat}&mlon=${notaria.lng}#map=15/${notaria.lat}/${notaria.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver en mapa (OpenStreetMap)
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
