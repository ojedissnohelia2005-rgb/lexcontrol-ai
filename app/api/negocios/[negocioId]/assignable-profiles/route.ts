import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteCtx = { params: Promise<{ negocioId: string }> };

/**
 * Perfiles que pueden recibir revisión legal (mismo negocio: creador, responsable, accesos).
 * Requiere SUPABASE_SERVICE_ROLE_KEY para listar membresía; si no, solo el usuario actual.
 */
export async function GET(_req: Request, ctx: RouteCtx) {
  const { negocioId } = await ctx.params;

  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: neg, error: nErr } = await supabase.from("negocios").select("id").eq("id", negocioId).maybeSingle();
  if (nErr || !neg) return NextResponse.json({ error: "Sin acceso o negocio inexistente" }, { status: 403 });

  const ids = new Set<string>();
  ids.add(userData.user.id);

  try {
    const admin = createSupabaseAdminClient();
    const { data: n } = await admin.from("negocios").select("created_by,responsable_id").eq("id", negocioId).single();
    if (n?.created_by) ids.add(n.created_by);
    if (n?.responsable_id) ids.add(n.responsable_id);

    const { data: acc } = await admin.from("negocio_accesos").select("profile_id").eq("negocio_id", negocioId);
    for (const a of acc ?? []) ids.add(a.profile_id);

    // Admins y super_admins pueden ser supervisores en cualquier negocio.
    const { data: admins } = await admin
      .from("profiles")
      .select("id,email,nombre,rol")
      .in("rol", ["admin", "super_admin"]);

    const uniqueById = new Map<string, { id: string; email: string; nombre: string | null; rol: string | null }>();

    if (admins) {
      for (const a of admins as any[]) {
        uniqueById.set(a.id, a);
      }
    }

    const { data: negocioProfiles } = await admin
      .from("profiles")
      .select("id,email,nombre,rol")
      .in("id", [...ids])
      .order("email");

    if (negocioProfiles) {
      for (const p of negocioProfiles as any[]) {
        uniqueById.set(p.id, p);
      }
    }

    return NextResponse.json({ profiles: Array.from(uniqueById.values()) });
  } catch {
    const { data: self } = await supabase.from("profiles").select("id,email,nombre,rol").eq("id", userData.user.id).maybeSingle();
    return NextResponse.json({ profiles: self ? [self] : [], limited: true });
  }
}
