import { AppShell } from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useEffect, useMemo, useState } from "react";
import { isSuperAdminEmail } from "@/lib/roles";

type Alerta = {
  id: string;
  created_at: string;
  titulo: string;
  resumen: string | null;
  link_oficial: string | null;
};

type NuevoUsuario = {
  id: string;
  created_at: string;
  email: string;
  rol_inicial: string;
};

function NotificacionesClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [nuevosUsuarios, setNuevosUsuarios] = useState<NuevoUsuario[]>([]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("alertas_legales")
      .select("id,created_at,titulo,resumen,link_oficial")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setAlertas((data ?? []) as Alerta[]));

    supabase
      .from("audit_log")
      .select("id,fecha,valor_nuevo")
      .eq("accion", "NEW_USER_SIGNUP")
      .order("fecha", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const list: NuevoUsuario[] =
          (data ?? []).map((row: any) => ({
            id: row.id,
            created_at: row.fecha,
            email: row.valor_nuevo?.email ?? "",
            rol_inicial: row.valor_nuevo?.rol_inicial ?? "user"
          })) ?? [];
        setNuevosUsuarios(list);
      });
  }, [supabase]);

  const isSuper = isSuperAdminEmail(email);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Notificaciones</div>
        <div className="mt-1 text-sm text-charcoal/60">
          Aquí ves la vigilancia legal generada por la IA y las altas de nuevos usuarios para revisión manual.
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Vigilancia legal (todas las cuentas)</div>
          <div className="mt-2 text-xs text-charcoal/60">
            Cualquier usuario puede lanzar vigilancia; las alertas sirven como pistas de normas recientes para revisión humana.
          </div>
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {alertas.length === 0 ? (
              <div className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/70 ring-1 ring-borderSoft">
                Aún no hay alertas. Lanza vigilancia desde el Dashboard para generar las primeras.
              </div>
            ) : (
              alertas.map((a) => (
                <div key={a.id} className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/80 ring-1 ring-borderSoft">
                  <div className="text-sm font-semibold text-charcoal">{a.titulo}</div>
                  <div className="mt-1 text-[11px] text-charcoal/60">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                  {a.resumen ? <div className="mt-1 text-xs">{a.resumen}</div> : null}
                  {a.link_oficial ? (
                    <a
                      href={a.link_oficial}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-sidebarRose underline"
                    >
                      Ver fuente
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Nuevos usuarios</div>
          <div className="mt-2 text-xs text-charcoal/60">
            Solo los super admin pueden cambiar roles, pero todos pueden ver el histórico de registros.
          </div>
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {nuevosUsuarios.length === 0 ? (
              <div className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/70 ring-1 ring-borderSoft">
                No hay registros recientes de nuevos usuarios.
              </div>
            ) : (
              nuevosUsuarios.map((u) => (
                <div key={u.id} className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/80 ring-1 ring-borderSoft">
                  <div className="text-sm font-semibold text-charcoal">{u.email || "Usuario"}</div>
                  <div className="mt-1 text-[11px] text-charcoal/60">
                    Registrado el {new Date(u.created_at).toLocaleString()} · Rol inicial: {u.rol_inicial}
                  </div>
                  {isSuper ? (
                    <div className="mt-2 text-[11px] text-charcoal/70">
                      Puedes gestionar roles desde la sección <span className="font-semibold">Transparencia</span>.
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificacionesPage() {
  return (
    <AppShell>
      <NotificacionesClient />
    </AppShell>
  );
}

