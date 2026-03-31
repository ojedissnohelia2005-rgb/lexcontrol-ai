"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSuperAdminEmail } from "@/lib/roles";

type AuditRow = {
  id: string;
  accion: string;
  tabla: string;
  registro_id: string | null;
  fecha: string;
  usuario_id: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
};

type NegocioMini = { id: string; nombre: string };

type Reporte = {
  id: string;
  negocio_id: string;
  titulo: string;
  resumen_ia: string | null;
  riesgos_json: unknown;
  created_at: string;
};

export default function TransparenciaPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; email: string | null; nombre: string | null; rol: string; created_at: string }>>([]);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);

  const [negocios, setNegocios] = useState<NegocioMini[]>([]);
  const [negocioAuditId, setNegocioAuditId] = useState<string>("");
  const [tituloInforme, setTituloInforme] = useState("Informe de auditoría externa");
  const [auditBusy, setAuditBusy] = useState(false);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [applyBusyId, setApplyBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  useEffect(() => {
    if (!email) return;
    if (!isSuperAdminEmail(email)) return;
    if (!supabase) return;
    supabase
      .from("audit_log")
      .select("id,accion,tabla,registro_id,fecha,usuario_id,valor_anterior,valor_nuevo")
      .order("fecha", { ascending: false })
      .limit(200)
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        setRows((data ?? []) as AuditRow[]);
      });
  }, [supabase, email]);

  useEffect(() => {
    if (!supabase) return;
    if (!email || !isSuperAdminEmail(email)) return;
    supabase
      .from("negocios")
      .select("id,nombre")
      .order("created_at", { ascending: false })
      .then(({ data }) => setNegocios((data ?? []) as NegocioMini[]));
  }, [supabase, email]);

  useEffect(() => {
    if (!supabase) return;
    if (!email || !isSuperAdminEmail(email)) return;
    // Lista de usuarios recientes (la policy de profiles solo deja ver propio, así que esto requiere service role vía endpoint)
    fetch("/api/admin/users/list")
      .then((r) => r.json())
      .then((d: { users?: Array<{ id: string; email: string | null; nombre: string | null; rol: string; created_at: string }>; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setUsers(d.users ?? []);
      })
      .catch(() => setUsers([]));
  }, [supabase, email]);

  async function setRole(userId: string, rol: "user" | "admin") {
    setError(null);
    setRoleBusyId(userId);
    try {
      const res = await fetch("/api/admin/users/set-role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, rol })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo actualizar rol");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, rol } : u)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setRoleBusyId(null);
    }
  }

  useEffect(() => {
    if (!supabase || !negocioAuditId) {
      setReportes([]);
      return;
    }
    supabase
      .from("auditoria_externa_reportes")
      .select("id,negocio_id,titulo,resumen_ia,riesgos_json,created_at")
      .eq("negocio_id", negocioAuditId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setReportes((data ?? []) as Reporte[]));
  }, [supabase, negocioAuditId]);

  const isSA = isSuperAdminEmail(email);

  async function analizarInforme(file: File) {
    if (!negocioAuditId) {
      setError("Selecciona un negocio para auditoría externa.");
      return;
    }
    setError(null);
    setAuditBusy(true);
    try {
      const form = new FormData();
      form.set("negocio_id", negocioAuditId);
      form.set("titulo", tituloInforme.trim() || "Informe de auditoría externa");
      form.set("file", file);
      const res = await fetch("/api/auditoria/analyze", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo analizar");
      const sb = supabase;
      if (sb && negocioAuditId) {
        const { data: list } = await sb
          .from("auditoria_externa_reportes")
          .select("id,negocio_id,titulo,resumen_ia,riesgos_json,created_at")
          .eq("negocio_id", negocioAuditId)
          .order("created_at", { ascending: false });
        setReportes((list ?? []) as Reporte[]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setAuditBusy(false);
    }
  }

  async function aplicarAMatriz(reporteId: string) {
    setError(null);
    setApplyBusyId(reporteId);
    try {
      const res = await fetch("/api/auditoria/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reporte_id: reporteId })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; propuestas_creadas?: number };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo aplicar");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setApplyBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Transparencia</div>
          <div className="mt-1 text-sm text-charcoal/60">Auditoría interna y externa. Visible solo para Super Admin.</div>
        </div>
      </div>

      {!email ? (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">Cargando usuario...</div>
      ) : null}

      {!supabase ? (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Configura Supabase</div>
          <div className="mt-1 text-sm text-charcoal/60">
            Falta <span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span> y <span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> en{" "}
            <span className="font-medium">.env.local</span>.
          </div>
        </div>
      ) : null}

      {email && !isSA ? (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
          <div className="text-sm font-medium">Acceso restringido</div>
          <div className="mt-1 text-sm text-charcoal/60">Solo Super Admin puede ver esta sección.</div>
        </div>
      ) : null}

      {isSA ? (
        <div className="mt-6 space-y-6">
          {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}

          <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Audit Log (últimos 200)</div>
              <div className="text-xs text-charcoal/60">{rows.length} eventos</div>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-borderSoft">
              <table className="w-full text-left text-sm">
                <thead className="bg-cream">
                  <tr className="text-xs text-charcoal/70">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Acción</th>
                    <th className="px-4 py-3">Tabla</th>
                    <th className="px-4 py-3">Registro</th>
                    <th className="px-4 py-3">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-borderSoft">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(r.fecha).toLocaleString()}</td>
                      <td className="px-4 py-3">{r.accion}</td>
                      <td className="px-4 py-3">{r.tabla}</td>
                      <td className="px-4 py-3">{r.registro_id ?? "—"}</td>
                      <td className="px-4 py-3">{r.usuario_id ?? "—"}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-sm text-charcoal/60" colSpan={5}>
                        Aún no hay eventos.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Usuarios recientes</div>
                <div className="mt-1 text-xs text-charcoal/60">
                  Al registrarse, aparece un evento <strong>NEW_USER_SIGNUP</strong> en el audit log. Aquí puedes decidir si queda como usuario común o se promueve a admin.
                </div>
              </div>
              <div className="text-xs text-charcoal/60">{users.length} usuarios</div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-borderSoft">
              <table className="w-full text-left text-sm">
                <thead className="bg-cream">
                  <tr className="text-xs text-charcoal/70">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-borderSoft">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(u.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3">{u.email ?? "—"}</td>
                      <td className="px-4 py-3">{u.nombre ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-cream px-2 py-1 text-xs ring-1 ring-borderSoft">{u.rol}</span>
                      </td>
                      <td className="px-4 py-3">
                        {u.rol === "super_admin" ? (
                          <span className="text-xs text-charcoal/60">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={roleBusyId === u.id}
                              className="rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-borderSoft hover:bg-cream/70 disabled:opacity-50"
                              onClick={() => void setRole(u.id, "user")}
                            >
                              Usuario
                            </button>
                            <button
                              type="button"
                              disabled={roleBusyId === u.id}
                              className="rounded-xl bg-sidebarRose px-3 py-2 text-xs font-medium text-cream hover:opacity-90 disabled:opacity-50"
                              onClick={() => void setRole(u.id, "admin")}
                            >
                              {roleBusyId === u.id ? "..." : "Promover a admin"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-sm text-charcoal/60" colSpan={5}>
                        Sin datos (si no tienes <code className="rounded bg-cream px-1">SUPABASE_SERVICE_ROLE_KEY</code> en el servidor, esta lista puede quedar vacía).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-borderSoft">
            <div className="text-sm font-medium">Auditoría externa</div>
            <div className="mt-1 text-sm text-charcoal/60">
              Sube el informe (PDF o texto). La IA extrae riesgos. Luego puedes generar <strong>propuestas pendientes</strong> para revisión (solo Super Admin aplica
              a la matriz).
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-sm font-medium">Negocio</div>
                <select
                  className="mt-2 w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
                  value={negocioAuditId}
                  onChange={(e) => setNegocioAuditId(e.target.value)}
                >
                  <option value="">— Selecciona —</option>
                  {negocios.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="text-sm font-medium">Título del informe</div>
                <input
                  className="mt-2 w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
                  value={tituloInforme}
                  onChange={(e) => setTituloInforme(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium">Archivo</div>
              <input
                type="file"
                accept=".pdf,.txt"
                disabled={auditBusy || !negocioAuditId}
                className="mt-2 block w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void analizarInforme(f);
                }}
              />
              {auditBusy ? <div className="mt-2 text-sm text-charcoal/60">Analizando con IA...</div> : null}
            </div>

            <div className="mt-6 space-y-3">
              {reportes.map((r) => {
                const len = Array.isArray(r.riesgos_json) ? r.riesgos_json.length : 0;
                return (
                  <div key={r.id} className="rounded-2xl bg-cream p-4 ring-1 ring-borderSoft">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{r.titulo}</div>
                        <div className="mt-1 text-xs text-charcoal/60">{new Date(r.created_at).toLocaleString()}</div>
                        <div className="mt-2 text-sm text-charcoal/80 line-clamp-3">{r.resumen_ia ?? "—"}</div>
                        <div className="mt-2 text-xs text-charcoal/60">{len} riesgos detectados</div>
                      </div>
                      <button
                        type="button"
                        disabled={len === 0 || applyBusyId === r.id}
                        className="rounded-xl bg-sidebarRose px-3 py-2 text-sm font-medium text-cream hover:opacity-90 disabled:opacity-50"
                        onClick={() => void aplicarAMatriz(r.id)}
                      >
                        {applyBusyId === r.id ? "Aplicando..." : "Crear propuestas"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {negocioAuditId && reportes.length === 0 ? (
                <div className="rounded-xl bg-cream px-3 py-3 text-sm text-charcoal/70 ring-1 ring-borderSoft">No hay informes para este negocio.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
