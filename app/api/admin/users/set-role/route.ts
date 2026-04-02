import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminSession } from "@/lib/auth-server";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  rol: z.enum(["user", "admin"])
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const ok = await isSuperAdminSession(supabase as any, userData.user.id, userData.user.email);
    if (!ok) return NextResponse.json({ error: "Solo Super Admin" }, { status: 403 });

    const body = BodySchema.parse(await req.json());

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sin cliente admin";
      return NextResponse.json(
        { error: `${msg}. Configura SUPABASE_SERVICE_ROLE_KEY en el entorno (Vercel / .env.local).` },
        { status: 503 }
      );
    }

    const { error } = await admin.from("profiles").update({ rol: body.rol }).eq("id", body.user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // audit
    await admin.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "SET_ROLE",
      tabla: "profiles",
      registro_id: body.user_id,
      valor_nuevo: { rol: body.rol }
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

