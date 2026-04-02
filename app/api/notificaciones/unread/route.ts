import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ has_unread: false }, { status: 200 });

  const orFilter = "revisado.is.null,revisado.eq.false";

  const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
  const rol = String((me as { rol?: string } | null)?.rol ?? "user");
  const isAdmin = rol === "admin" || rol === "super_admin";

  const [{ count: c1 }, { count: c2 }, matrizRes] = await Promise.all([
    supabase
      .from("alertas_legales")
      .select("id", { count: "exact", head: true })
      .or(orFilter),
    supabase
      .from("alertas_actualizacion_normativa")
      .select("id", { count: "exact", head: true })
      .or(orFilter),
    isAdmin
      ? supabase.from("matriz_edit_alertas").select("id", { count: "exact", head: true }).eq("revisado", false)
      : Promise.resolve({ count: 0 as number | null })
  ]);

  const c3 = matrizRes && "count" in matrizRes ? (matrizRes.count ?? 0) : 0;
  const total = (c1 ?? 0) + (c2 ?? 0) + c3;
  return NextResponse.json({ has_unread: total > 0, total });
}

