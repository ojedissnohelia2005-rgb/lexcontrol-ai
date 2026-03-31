"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";

export function HomeEntry() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <div className="rounded-2xl bg-white p-8 shadow-card ring-1 ring-borderSoft">
          <div className="flex justify-center">
            <Logo size={56} />
          </div>
          <h1 className="mt-6 text-center text-2xl font-semibold text-charcoal">LexControl AI</h1>
          <p className="mt-2 text-center text-sm text-charcoal/60">Cumplimiento normativo inteligente · Ecuador</p>

          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/login"
              className="block w-full rounded-xl bg-sidebarRose py-3 text-center text-sm font-medium text-cream hover:opacity-90"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login?register=1"
              className="block w-full rounded-xl bg-cream py-3 text-center text-sm font-medium text-charcoal ring-1 ring-borderSoft hover:bg-cream/80"
            >
              Crear cuenta
            </Link>
            <p className="text-center text-xs text-charcoal/50">
              Para acceder al panel necesitas una cuenta y sesión activa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
