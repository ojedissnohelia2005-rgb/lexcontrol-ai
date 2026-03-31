import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  negocio_id: z.string().uuid()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
    const rol = String((me as { rol?: string } | null)?.rol ?? "");
    if (rol !== "admin" && rol !== "super_admin") {
      return NextResponse.json({ error: "Solo admin/super admin puede eliminar la guía" }, { status: 403 });
    }

    const body = BodySchema.parse(await req.json());
    const { error } = await supabase.from("negocios").update({ guia_fuentes_ia: null }).eq("id", body.negocio_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "ELIMINAR_GUIA_RUBRO_IA",
      tabla: "negocios",
      registro_id: body.negocio_id,
      valor_nuevo: { guia_fuentes_ia: null }
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

