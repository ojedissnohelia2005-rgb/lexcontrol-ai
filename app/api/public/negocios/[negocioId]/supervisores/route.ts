import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteCtx = { params: Promise<{ negocioId: string }> };

// Supervisores visibles en el registro (creador, responsable, accesos del negocio + admins/super_admins globales).
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { negocioId } = await ctx.params;
    const admin = createSupabaseAdminClient();

    const { data: n, error: nErr } = await admin
      .from("negocios")
      .select("id,created_by,responsable_id")
      .eq("id", negocioId)
      .maybeSingle();
    if (nErr || !n) return NextResponse.json({ error: "Negocio inexistente" }, { status: 404 });

    const ids = new Set<string>();
    if (n.created_by) ids.add(n.created_by);
    if (n.responsable_id) ids.add(n.responsable_id);

    const { data: acc } = await admin.from("negocio_accesos").select("profile_id").eq("negocio_id", negocioId);
    for (const a of acc ?? []) ids.add(a.profile_id);

    const uniqueById = new Map<string, { id: string; email: string; nombre: string | null; rol: string | null }>();

    if (ids.size > 0) {
      const { data: negocioProfiles, error } = await admin
        .from("profiles")
        .select("id,email,nombre,rol")
        .in("id", [...ids])
        .order("email");
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      for (const p of (negocioProfiles ?? []) as any[]) {
        uniqueById.set(p.id, p);
      }
    }

    // Admins y super_admins: siempre disponibles como supervisores en cualquier negocio.
    const { data: admins, error: aErr } = await admin
      .from("profiles")
      .select("id,email,nombre,rol")
      .in("rol", ["admin", "super_admin"])
      .order("email");
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });
    for (const a of (admins ?? []) as any[]) {
      uniqueById.set(a.id, a);
    }

    return NextResponse.json({ profiles: Array.from(uniqueById.values()) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

