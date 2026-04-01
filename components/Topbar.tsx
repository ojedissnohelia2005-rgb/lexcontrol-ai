"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSuperAdminEmail } from "@/lib/roles";
import { AppHelpPopover } from "@/components/AppHelpPopover";

export function Topbar() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return (
    <div className="flex flex-col gap-2 px-6 py-3 md:flex-row md:items-center md:justify-between md:gap-3 md:py-4">
      {demoMode ? (
        <div className="order-first w-full rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 ring-1 ring-amber-200 md:order-none md:w-auto md:text-left">
          <strong>Modo demo:</strong> navegación sin login. Configura Supabase y Gemini en <code className="rounded bg-white/80 px-1">.env.local</code> y pon{" "}
          <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_DEMO_MODE=false</code> para producción.
        </div>
      ) : null}
      <div className="flex items-center gap-3 text-sm text-charcoal/70">
        <span>
          <span className="font-medium text-charcoal">LexControl AI</span> · Matriz de Cumplimiento Normativo Inteligente
        </span>
        <AppHelpPopover />
      </div>
      <div className="flex items-center gap-3">
        {!supabase ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/login"
              className="rounded-xl bg-sidebarRose px-3 py-2 text-sm font-medium text-cream hover:opacity-90"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login?register=1"
              className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-charcoal ring-1 ring-borderSoft hover:bg-cream/80"
            >
              Registrarse
            </Link>
            <div
              className={
                demoMode
                  ? "w-full rounded-xl bg-cream px-3 py-2 text-xs text-charcoal/70 ring-1 ring-borderSoft sm:w-auto"
                  : "w-full rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200 sm:w-auto"
              }
            >
              {demoMode ? (
                <>Sin Supabase en .env · el login funcionará al configurar URL y anon key.</>
              ) : (
                <>
                  Configura <span className="font-medium">.env.local</span> (Supabase) para activar login.
                </>
              )}
            </div>
          </div>
        ) : email ? (
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{email}</div>
              <div className="text-xs text-charcoal/60">{isSuperAdminEmail(email) ? "Super Admin" : "Usuario"}</div>
            </div>
            <button
              type="button"
              className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-charcoal ring-1 ring-borderSoft hover:bg-cream/80"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/login"
              className="rounded-xl bg-sidebarRose px-3 py-2 text-sm font-medium text-cream hover:opacity-90"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login?register=1"
              className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-charcoal ring-1 ring-borderSoft hover:bg-cream/80"
            >
              Registrarse
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

