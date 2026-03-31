import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1)
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: me } = await supabase.from("profiles").select("rol,email").eq("id", userData.user.id).maybeSingle();
    const rol = String(me?.rol ?? "");
    if (rol !== "admin" && rol !== "super_admin") {
      return NextResponse.json({ error: "Solo admin/super admin puede eliminar archivos" }, { status: 403 });
    }

    const body = BodySchema.parse(await req.json());
    const admin = createSupabaseAdminClient();
    const { error: delErr } = await admin.storage.from(body.bucket).remove([body.path]);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

