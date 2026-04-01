import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ negocioId: string }> };

const BodySchema = z
  .object({
    confirm: z.literal(true)
  })
  .optional();

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const { negocioId } = await ctx.params;
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
    const rol = String((me as { rol?: string } | null)?.rol ?? "");
    if (rol !== "admin" && rol !== "super_admin") {
      return NextResponse.json({ error: "Solo admin/super admin puede eliminar negocios" }, { status: 403 });
    }

    // Body opcional, solo para evitar llamadas accidentales desde herramientas.
    await req
      .json()
      .then((raw) => BodySchema.parse(raw))
      .catch(() => {
        /* ignore parse problems; frontend ya confirmó */
      });

    const { error } = await supabase.from("negocios").delete().eq("id", negocioId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "NEGOCIO_DELETE",
      tabla: "negocios",
      registro_id: negocioId,
      valor_nuevo: { eliminado: true }
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

