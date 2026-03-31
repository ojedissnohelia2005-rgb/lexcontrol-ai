import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteCtx = { params: Promise<{ negocioId: string }> };

const BodySchema = z.object({
  regenerate: z.boolean().optional()
});

function randomKey(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request, ctx: RouteCtx) {
  const { negocioId } = await ctx.params;
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
  const rol = String((me as { rol?: string } | null)?.rol ?? "");
  if (rol !== "admin" && rol !== "super_admin") {
    return NextResponse.json({ error: "Solo admin/super_admin puede generar claves de registro" }, { status: 403 });
  }

  const _body = BodySchema.safeParse(await req.json().catch(() => ({})));
  const key = randomKey(10);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("negocios")
    .update({ clave_registro: key })
    .eq("id", negocioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, clave_registro: key });
}

