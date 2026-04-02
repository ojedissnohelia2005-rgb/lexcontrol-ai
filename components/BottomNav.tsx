"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBell, IconBuilding, IconDashboard, IconNotebook, IconScale } from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSuperAdminEmail } from "@/lib/roles";
import { cn } from "@/lib/utils";

const baseItems = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/negocios", label: "Negocios", Icon: IconBuilding },
  { href: "/ai-notebook", label: "AI Notebook", Icon: IconNotebook },
  { href: "/notificaciones", label: "Notificaciones", Icon: IconBell }
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
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
  const items = useMemo(() => {
    if (showTransparencia) {
      return [...baseItems, { href: "/transparencia", label: "Transparencia", Icon: IconScale }];
    }
    return baseItems;
  }, [showTransparencia]);

  return (
    <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-lg",
          "rounded-t-[2.75rem] border border-white/15 border-b-0 bg-coffeeNav",
          "shadow-[0_-12px_36px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.1)]"
        )}
      >
        <div className="grid auto-cols-fr grid-flow-col gap-0 px-1.5 pt-4 pb-3.5">
          {items.map(({ href, label, Icon }, idx) => {
            const active = pathname?.startsWith(href);
            const isNotif = href === "/notificaciones";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex min-w-0 flex-col items-center justify-start gap-1.5 rounded-2xl px-1 py-1.5 text-white transition-colors duration-200",
                  idx > 0 && "border-l border-white/[0.08]"
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all duration-200",
                    active
                      ? "bg-white/22 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                      : "text-white/88 group-hover:bg-white/12 group-hover:text-white",
                    isNotif && hasUnread && !active && "bg-red-600/95 text-white group-hover:bg-red-600"
                  )}
                >
                  <Icon className="h-[22px] w-[22px]" aria-hidden />
                </span>
                <span className="line-clamp-2 min-h-[2.25rem] max-w-[4.5rem] text-center text-[9.5px] font-semibold leading-[1.15] tracking-tight text-white/95">
                  {label}
                </span>
                {isNotif && hasUnread ? (
                  <span className="absolute right-1 top-2 h-2 w-2 rounded-full bg-white shadow-sm ring-2 ring-coffeeNav" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
