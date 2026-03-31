import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ has_unread: false }, { status: 200 });

  const orFilter = "revisado.is.null,revisado.eq.false";

  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    supabase
      .from("alertas_legales")
      .select("id", { count: "exact", head: true })
      .or(orFilter),
    supabase
      .from("alertas_actualizacion_normativa")
      .select("id", { count: "exact", head: true })
      .or(orFilter)
  ]);

  const total = (c1 ?? 0) + (c2 ?? 0);
  return NextResponse.json({ has_unread: total > 0, total });
}

