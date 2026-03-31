import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  tipo: z.enum(["legal", "actualizacion"]),
  id: z.string().uuid()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = BodySchema.parse(await req.json());
  const table = body.tipo === "legal" ? "alertas_legales" : "alertas_actualizacion_normativa";

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from(table).update({ revisado: true }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

