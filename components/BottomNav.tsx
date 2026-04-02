"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBuilding, IconDashboard, IconNotebook } from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSuperAdminEmail } from "@/lib/roles";
import { cn } from "@/lib/utils";

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

const items = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/negocios", label: "Negocios", Icon: IconBuilding },
  { href: "/ai-notebook", label: "AI Notebook", Icon: IconNotebook },
  { href: "/notificaciones", label: "Notificaciones", Icon: IconShield }
];

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

  return (
    <nav className="sticky bottom-0 z-30 border-t border-borderSoft bg-sidebarRose/98 px-4 py-2 text-xs text-cream shadow-[0_-4px_12px_rgba(0,0,0,0.12)]">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2">
        <div className="flex flex-1 items-center justify-around gap-1">
          {items.map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href);
            const isNotif = href === "/notificaciones";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center rounded-xl px-2 py-1.5 transition",
                  active && "bg-cream/20 text-cream shadow-sm",
                  !active && "text-cream/80 hover:text-cream hover:bg-cream/10",
                  isNotif && hasUnread && !active && "bg-red-500/70 text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1 text-[10px]">{label}</span>
                {isNotif && hasUnread ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </Link>
            );
          })}
          {showTransparencia ? (
            <Link
              href="/transparencia"
              className={cn(
                "flex flex-col items-center rounded-xl px-2 py-1.5 text-[10px] transition",
                pathname?.startsWith("/transparencia") ? "bg-cream/20 text-cream shadow-sm" : "text-cream/80 hover:text-cream hover:bg-cream/10"
              )}
            >
              <IconShield className="h-4 w-4" />
              <span className="mt-1">Transparencia</span>
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

