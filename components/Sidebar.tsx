"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { IconBuilding, IconDashboard, IconNotebook } from "@/components/icons";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSuperAdminEmail } from "@/lib/roles";

const nav = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/negocios", label: "Negocios", Icon: IconBuilding },
  { href: "/ai-notebook", label: "AI Notebook", Icon: IconNotebook },
  { href: "/notificaciones", label: "Notificaciones", Icon: IconShield }
];

function IconShield({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 3 5 6v5c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    async function loadUnread() {
      try {
        const res = await fetch("/api/notificaciones/unread");
        if (!res.ok) return;
        const data = (await res.json()) as { has_unread?: boolean };
        setHasUnread(Boolean(data.has_unread));
      } catch {
        // ignore
      }
    }
    void loadUnread();
  }, []);

  const showTransparencia = isSuperAdminEmail(email);

  return (
    <aside className="hidden md:flex md:w-[260px] md:flex-col md:gap-4 bg-sidebarRose text-cream border-r border-black/5">
      <div className="px-5 pt-5 pb-2">
        <Logo />
      </div>
      <nav className="px-3 pb-6">
        <div className="mt-3 space-y-1">
          {nav.map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href);
            const isNotif = href === "/notificaciones";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  "hover:bg-cream/10 hover:translate-x-0.5",
                  active && "bg-cream/20 ring-1 ring-cream/20 shadow-sm",
                  isNotif && hasUnread && !active && "bg-red-500/75 text-white shadow-sm"
                )}
              >
                <Icon className="h-5 w-5 text-cream/90" />
                <span className="text-cream/95">
                  {label}
                  {isNotif && hasUnread ? <span className="ml-2 inline-block h-2 w-2 rounded-full bg-white" /> : null}
                </span>
              </Link>
            );
          })}
          {showTransparencia ? (
            <Link
              href="/transparencia"
              className={cn(
                "mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                "hover:bg-cream/10",
                pathname?.startsWith("/transparencia") && "bg-cream/15 ring-1 ring-cream/10"
              )}
            >
              <IconShield className="h-5 w-5 text-cream/90" />
              <span className="text-cream/95">Transparencia</span>
            </Link>
          ) : null}
        </div>
      </nav>
      <div className="mt-auto space-y-3 px-5 pb-5 text-xs text-cream/70">
        <div className="rounded-xl bg-cream/10 px-3 py-3 ring-1 ring-cream/10">
          <div className="font-medium text-cream/90">Cuenta</div>
          {supabase && email ? (
            <>
              <div className="mt-2 truncate text-[11px] text-cream/80" title={email}>
                {email}
              </div>
              <button
                type="button"
                className="mt-3 w-full rounded-xl bg-cream/20 px-3 py-2 text-center text-sm font-medium text-cream ring-1 ring-cream/20 hover:bg-cream/30"
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/");
                  router.refresh();
                }}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <Link
                href="/login"
                className="block w-full rounded-xl bg-cream/20 py-2 text-center text-sm font-medium text-cream ring-1 ring-cream/20 hover:bg-cream/30"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/login?register=1"
                className="block w-full rounded-xl py-2 text-center text-sm text-cream/90 underline underline-offset-2 hover:text-cream"
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

