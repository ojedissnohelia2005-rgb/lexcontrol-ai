import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteCtx = { params: Promise<{ negocioId: string }> };

// Supervisores visibles en el registro (creador, responsable, accesos del negocio).
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

    if (ids.size === 0) return NextResponse.json({ profiles: [] });

    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id,email,nombre,rol")
      .in("id", [...ids])
      .order("email");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ profiles: profiles ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

