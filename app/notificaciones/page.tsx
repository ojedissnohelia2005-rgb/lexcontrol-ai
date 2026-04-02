"use client";

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

type AlertaActualizacion = {
  id: string;
  created_at: string;
  normativa_doc_id: string;
  tiene_posible_actualizacion: boolean;
  comentario: string | null;
  nivel_confianza: number | null;
};

type MatrizEditAlerta = {
  id: string;
  created_at: string;
  negocio_id: string;
  matriz_row_id: string;
  campos_afectados: string[];
  revisado: boolean;
  negocios: { nombre: string } | null;
};

function NotificacionesClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [profileRol, setProfileRol] = useState<string>("user");
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [nuevosUsuarios, setNuevosUsuarios] = useState<NuevoUsuario[]>([]);
  const [actualizaciones, setActualizaciones] = useState<AlertaActualizacion[]>([]);
  const [matrizEdits, setMatrizEdits] = useState<MatrizEditAlerta[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      const uid = data.user?.id;
      if (!uid) return;
      supabase
        .from("profiles")
        .select("rol")
        .eq("id", uid)
        .maybeSingle()
        .then(({ data: p }) => setProfileRol(String((p as { rol?: string } | null)?.rol ?? "user")));
    });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("alertas_legales")
      .select("id,created_at,titulo,resumen,link_oficial")
      .or("revisado.is.null,revisado.eq.false")
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

    supabase
      .from("alertas_actualizacion_normativa")
      .select("id,created_at,normativa_doc_id,tiene_posible_actualizacion,comentario,nivel_confianza")
      .or("revisado.is.null,revisado.eq.false")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setActualizaciones((data ?? []) as AlertaActualizacion[]));
  }, [supabase]);

  useEffect(() => {
    if (!supabase || (profileRol !== "admin" && profileRol !== "super_admin")) {
      setMatrizEdits([]);
      return;
    }
    supabase
      .from("matriz_edit_alertas")
      .select("id,created_at,negocio_id,matriz_row_id,campos_afectados,revisado, negocios(nombre)")
      .eq("revisado", false)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (error) {
          setMatrizEdits([]);
          return;
        }
        const raw = (data ?? []) as Array<
          Omit<MatrizEditAlerta, "negocios"> & { negocios: { nombre: string } | { nombre: string }[] | null }
        >;
        setMatrizEdits(
          raw.map((row) => {
            const n = row.negocios;
            const nombre =
              n && !Array.isArray(n) ? n.nombre : Array.isArray(n) && n[0] ? n[0].nombre : undefined;
            return {
              ...row,
              negocios: nombre != null ? { nombre } : null
            };
          })
        );
      });
  }, [supabase, profileRol]);

  const isSuper = isSuperAdminEmail(email);

  async function marcarRevisada(tipo: "legal" | "actualizacion", id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/notificaciones/revisar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo, id })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo marcar como revisada");
      if (tipo === "legal") {
        setAlertas((prev) => prev.filter((a) => a.id !== id));
      } else {
        setActualizaciones((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // ignore error visual por ahora
    } finally {
      setBusyId(null);
    }
  }

  async function dejarCambioMatriz(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/matriz/ack-matriz-edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error");
      setMatrizEdits((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  }

  async function deshacerCambioMatriz(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/matriz/revert-matriz-edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error");
      setMatrizEdits((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  }

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
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      className="rounded-lg bg-white px-3 py-1 text-[11px] ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                      onClick={() => void marcarRevisada("legal", a.id)}
                    >
                      {busyId === a.id ? "Marcando…" : "Marcar revisada"}
                    </button>
                  </div>
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

        {profileRol === "admin" || profileRol === "super_admin" ? (
          <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-borderSoft lg:col-span-2">
            <div className="text-sm font-medium">Cambios en matrices de cumplimiento</div>
            <div className="mt-2 text-xs text-charcoal/60">
              Un usuario editó celdas en una matriz. Puedes aceptar el cambio (queda como está) o deshacerlo (vuelve al valor anterior en los campos afectados).
            </div>
            <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
              {matrizEdits.length === 0 ? (
                <div className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/70 ring-1 ring-borderSoft">
                  No hay ediciones pendientes de revisión.
                </div>
              ) : (
                matrizEdits.map((a) => (
                  <div key={a.id} className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/80 ring-1 ring-borderSoft">
                    <div className="text-sm font-semibold text-charcoal">
                      {a.negocios?.nombre ?? "Negocio"} · Fila {a.matriz_row_id.slice(0, 8)}…
                    </div>
                    <div className="mt-1 text-[11px] text-charcoal/60">{new Date(a.created_at).toLocaleString()}</div>
                    <div className="mt-1 text-[11px] text-charcoal/70">
                      Campos: {a.campos_afectados.join(", ")}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        className="rounded-lg bg-charcoal px-3 py-1 text-[11px] text-white hover:bg-charcoal/90 disabled:opacity-50"
                        onClick={() => void dejarCambioMatriz(a.id)}
                      >
                        {busyId === a.id ? "…" : "Dejar cambio"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        className="rounded-lg bg-white px-3 py-1 text-[11px] ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                        onClick={() => void deshacerCambioMatriz(a.id)}
                      >
                        Deshacer
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Posibles actualizaciones de normativa</div>
          <div className="mt-2 text-xs text-charcoal/60">
            La IA marca normas que podrían tener una versión más reciente. Revisa las fuentes y sube manualmente la nueva norma si aplica.
          </div>
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {actualizaciones.length === 0 ? (
              <div className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/70 ring-1 ring-borderSoft">
                No hay alertas de actualización todavía. Ejecuta vigilancia legal con normas recientes en memoria.
              </div>
            ) : (
              actualizaciones.map((a) => (
                <div key={a.id} className="rounded-xl bg-cream px-3 py-3 text-xs text-charcoal/80 ring-1 ring-borderSoft">
                  <div className="text-[11px] text-charcoal/60">
                    {new Date(a.created_at).toLocaleString()} · Norma ID: {a.normativa_doc_id.slice(0, 8)}…
                  </div>
                  <div className="mt-1 text-xs">
                    {a.comentario ?? "Posible actualización detectada. Revisa fuentes oficiales y, si aplica, sube la nueva versión desde AI Notebook."}
                  </div>
                  <div className="mt-1 text-[11px] text-charcoal/60">
                    Confianza: {a.nivel_confianza != null ? Math.round(a.nivel_confianza * 100) + "%" : "—"}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      className="rounded-lg bg-white px-3 py-1 text-[11px] ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                      onClick={() => void marcarRevisada("actualizacion", a.id)}
                    >
                      {busyId === a.id ? "Marcando…" : "Aceptar / ya revisada"}
                    </button>
                  </div>
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

