import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminSession } from "@/lib/auth-server";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const ok = await isSuperAdminSession(supabase as any, userData.user.id, userData.user.email);
    if (!ok) return NextResponse.json({ error: "Solo Super Admin" }, { status: 403 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id,email,nombre,rol,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ users: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

