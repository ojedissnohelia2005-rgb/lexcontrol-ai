"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
  metric: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Ahora es más fácil: subimos la norma, la IA propone requisitos y mi equipo solo valida y asigna responsables. Se acabaron los Excel eternos.",
    name: "María P.",
    role: "Coordinación de Cumplimiento",
    company: "Operadora de Energía",
    metric: "Menos tiempo en revisión"
  },
  {
    quote:
      "Con la trazabilidad y evidencias centralizadas, la auditoría dejó de ser una persecución. Tenemos historial, fuentes y responsables en un solo lugar.",
    name: "Carlos A.",
    role: "Auditor Interno",
    company: "Servicios Financieros",
    metric: "Más orden y control"
  },
  {
    quote:
      "La vigilancia legal y las propuestas pendientes nos permiten reaccionar rápido. Lo que aplica se aprueba; lo que no, se marca y queda documentado.",
    name: "Andrea R.",
    role: "Asesoría Legal",
    company: "Industria",
    metric: "Decisiones más rápidas"
  },
  {
    quote:
      "Asignar gerencia, jefatura y supervisor legal en el mismo flujo cambió el juego: cada requisito sale con dueño y fecha desde el inicio.",
    name: "Luis V.",
    role: "PMO / Gestión",
    company: "Operaciones",
    metric: "Responsables claros"
  }
];

function formatAuthError(e: unknown, mode: "login" | "register"): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("over_email_send_rate_limit")) {
    return mode === "register"
      ? "Límite temporal de Supabase (muchos registros o correos de confirmación desde tu IP). Cualquier correo puede registrarse: el bloqueo no es de LexControl. En Supabase: Authentication → Providers → Email → desactiva «Confirm email» mientras pruebas (evita un correo por cada alta), espera 15–60 min si sigue bloqueado, o revisa Authentication → Attack Protection / Rate limits según tu plan."
      : "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
  }
  return raw;
}

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const [tIdx, setTIdx] = useState(0);
  const [tTick, setTTick] = useState(0);

  useEffect(() => {
    // Rotación estilo "video": cambia solo cada 6s
    const id = window.setInterval(() => {
      setTIdx((i) => (i + 1) % TESTIMONIALS.length);
      setTTick((t) => t + 1);
    }, 6000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("register") === "1") setMode("register");
  }, []);

  const [setupSupabase, setSetupSupabase] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    setSetupSupabase(q.get("setup") === "supabase");
  }, []);

  async function onSubmit() {
    setError(null);
    if (!supabase) {
      setError("Falta configurar Supabase en .env.local (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY).");
      return;
    }
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        window.location.href = "/dashboard";
      } else {
        const origin = typeof window !== "undefined" ? window.location.origin : undefined;
        const { error: e } = await supabase.auth.signUp({
          email,
          password,
          options: origin ? { emailRedirectTo: `${origin}/dashboard` } : undefined
        });
        if (e) throw e;
        // For email-confirm flows, user may need to confirm; still redirect to dashboard for now.
        window.location.href = "/dashboard";
      }
    } catch (e: unknown) {
      setError(formatAuthError(e, mode));
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="px-6 pt-6">
        <Link href="/" className="text-sm text-sidebarRose underline underline-offset-2 hover:opacity-80">
          ← Volver al inicio
        </Link>
      </div>
      <div className="mx-auto flex min-h-screen max-w-[1200px] items-center justify-center px-6 pb-16 pt-4">
        <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2">
          <div className="hidden md:block">
            <div className="rounded-2xl bg-white p-8 shadow-card ring-1 ring-borderSoft">
              <div className="text-xs font-medium tracking-widest text-charcoal/50">LEXCONTROL AI</div>
              <div className="mt-2 text-3xl font-semibold leading-tight">
                Cumplimiento inteligente
                <br />
                para equipos reales.
              </div>
              <div className="mt-4 text-sm text-charcoal/70">
                Matriz de Cumplimiento Normativo + IA (Gemini) + Auditoría + Evidencias.
              </div>

              {/* Reseñas rotativas */}
              <div className="mt-6 overflow-hidden rounded-2xl bg-cream ring-1 ring-borderSoft">
                <div className="relative px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-charcoal/60">Reseñas de clientes</div>
                    <div className="text-[11px] text-charcoal/50">
                      {tIdx + 1}/{TESTIMONIALS.length}
                    </div>
                  </div>

                  <div key={`${tIdx}-${tTick}`} className="mt-3">
                    <div className="text-sm leading-relaxed text-charcoal/90">“{TESTIMONIALS[tIdx].quote}”</div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-charcoal">{TESTIMONIALS[tIdx].name}</div>
                        <div className="truncate text-[11px] text-charcoal/60">
                          {TESTIMONIALS[tIdx].role} · {TESTIMONIALS[tIdx].company}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-sidebarRose ring-1 ring-borderSoft">
                        {TESTIMONIALS[tIdx].metric}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-borderSoft">
                    <div
                      className="h-full bg-sidebarRose/70"
                      style={{
                        width: "100%",
                        animation: "lxprogress 6s linear infinite"
                      }}
                      aria-hidden
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {TESTIMONIALS.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`h-2.5 w-2.5 rounded-full ring-1 ring-borderSoft ${i === tIdx ? "bg-sidebarRose" : "bg-white"}`}
                        onClick={() => {
                          setTIdx(i);
                          setTTick((t) => t + 1);
                        }}
                        aria-label={`Ver reseña ${i + 1}`}
                      />
                    ))}
                  </div>

                  <style jsx>{`
                    @keyframes lxprogress {
                      from {
                        transform: translateX(-100%);
                      }
                      to {
                        transform: translateX(0%);
                      }
                    }
                  `}</style>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-cream p-4 ring-1 ring-borderSoft">
                  <div className="text-sm font-medium">Dashboard</div>
                  <div className="mt-1 text-xs text-charcoal/60">Widgets y alertas en tiempo real.</div>
                </div>
                <div className="rounded-2xl bg-cream p-4 ring-1 ring-borderSoft">
                  <div className="text-sm font-medium">Matriz</div>
                  <div className="mt-1 text-xs text-charcoal/60">Prioridad automática y sanciones.</div>
                </div>
                <div className="rounded-2xl bg-cream p-4 ring-1 ring-borderSoft">
                  <div className="text-sm font-medium">AI Notebook</div>
                  <div className="mt-1 text-xs text-charcoal/60">PDF → extracción → aprobación.</div>
                </div>
                <div className="rounded-2xl bg-cream p-4 ring-1 ring-borderSoft">
                  <div className="text-sm font-medium">Transparencia</div>
                  <div className="mt-1 text-xs text-charcoal/60">Audit log y auditoría externa.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-full rounded-2xl bg-white p-8 shadow-card ring-1 ring-borderSoft">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium tracking-widest text-charcoal/50">ACCESO</div>
                  <div className="mt-1 text-2xl font-semibold">{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</div>
                </div>
                <button
                  className="rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft hover:bg-cream/70"
                  onClick={() => setMode(mode === "login" ? "register" : "login")}
                  type="button"
                >
                  {mode === "login" ? "Registrarse" : "Volver"}
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {setupSupabase ? (
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                    Completa <span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span> y{" "}
                    <span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> en <span className="font-medium">.env.local</span>, reinicia{" "}
                    <code className="rounded bg-white/80 px-1">npm run dev</code> y ejecuta el SQL de{" "}
                    <code className="rounded bg-white/80 px-1">supabase-schema.sql</code> en tu proyecto Supabase.
                  </div>
                ) : null}
                {!supabase ? (
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                    Falta configurar Supabase en <span className="font-medium">.env.local</span>.
                  </div>
                ) : null}
                <label className="block">
                  <div className="text-sm font-medium">Email</div>
                  <input
                    className="mt-2 w-full rounded-xl bg-cream px-3 py-2 ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    autoComplete="email"
                  />
                </label>
                <label className="block">
                  <div className="text-sm font-medium">Contraseña</div>
                  <input
                    className="mt-2 w-full rounded-xl bg-cream px-3 py-2 ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                </label>
                {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}
                <button
                  className="w-full rounded-xl bg-sidebarRose px-3 py-2 text-sm font-medium text-cream hover:opacity-90 disabled:opacity-50"
                  disabled={busy || !supabase || !email || !password}
                  onClick={onSubmit}
                >
                  {busy ? "Procesando..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
                </button>
                <div className="text-xs text-charcoal/60">
                  {mode === "register" ? (
                    <>
                      Varios correos pueden darse de alta (perfil normal en la base de datos). Si pruebas muchas cuentas,
                      en Supabase desactiva la confirmación por email o espera a que caduque el rate limit del proveedor.
                    </>
                  ) : (
                    <>Si tu proyecto requiere confirmación por email, confirma y vuelve a iniciar sesión.</>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

