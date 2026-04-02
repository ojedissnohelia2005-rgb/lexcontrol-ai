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

const baseItems = [
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
  const items = useMemo(() => {
    if (showTransparencia) {
      return [...baseItems, { href: "/transparencia", label: "Transparencia", Icon: IconShield }];
    }
    return baseItems;
  }, [showTransparencia]);

  const n = items.length;

  return (
    <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto relative w-full max-w-[min(100%,32rem)]">
        <svg
          className="absolute bottom-0 left-1/2 block w-[118%] max-w-none -translate-x-1/2 text-coffeeNav drop-shadow-[0_-10px_36px_rgba(0,0,0,0.35)]"
          style={{ height: "5.5rem" }}
          viewBox="0 0 360 80"
          preserveAspectRatio="xMidYMax meet"
          aria-hidden
        >
          <defs>
            <linearGradient id="bottomNavArcHi" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
            </linearGradient>
          </defs>
          <path
            fill="currentColor"
            d="M 0 32 Q 180 96 360 32 L 360 80 L 0 80 Z"
          />
          <path fill="url(#bottomNavArcHi)" d="M 0 32 Q 180 96 360 32 L 360 80 L 0 80 Z" />
        </svg>

        <div
          className="absolute inset-x-[6%] bottom-2 top-2 z-0 flex rounded-t-[999px] overflow-hidden opacity-[0.22] pointer-events-none"
          aria-hidden
        >
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-white/25 last:border-r-0" />
          ))}
        </div>

        <div className="relative z-10 flex items-end justify-between gap-0.5 px-3 pb-2.5 pt-3">
          {items.map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href);
            const isNotif = href === "/notificaciones";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center rounded-2xl px-1 py-1 text-white transition",
                  active && "bg-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]",
                  !active && "text-white/90 hover:bg-white/12 hover:text-white",
                  isNotif && hasUnread && !active && "bg-red-700/85 text-white"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="mt-1 line-clamp-2 text-center text-[9px] font-medium leading-tight">{label}</span>
                {isNotif && hasUnread ? <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" /> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
