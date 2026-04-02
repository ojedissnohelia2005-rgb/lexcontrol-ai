import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminEmail } from "@/lib/roles";

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
  const isAdminRole = rol === "admin" || rol === "super_admin";
  const isGlobalSuper = isSuperAdminEmail(userData.user.email);
  if (!isAdminRole && !isGlobalSuper) {
    return NextResponse.json({ error: "Solo admin/super_admin puede generar claves de registro" }, { status: 403 });
  }

  void BodySchema.safeParse(await req.json().catch(() => ({})));
  const key = randomKey(10);

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("negocios").update({ clave_registro: key }).eq("id", negocioId);
    if (error) throw error;
  } catch {
    const { error } = await supabase.from("negocios").update({ clave_registro: key }).eq("id", negocioId);
    if (error) {
      return NextResponse.json(
        {
          error:
            error.message +
            " Si persiste, ejecuta en Supabase la migración supabase-migration-negocio-clave-registro.sql y comprueba que tu usuario tenga acceso al negocio."
        },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: true, clave_registro: key });
}
