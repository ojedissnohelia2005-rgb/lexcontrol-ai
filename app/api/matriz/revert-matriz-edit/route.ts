import { NextResponse } from "next/server";
import { z } from "zod";
import { MATRIZ_TRACKED_FIELD_SET } from "@/lib/matriz-tracked-fields";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  id: z.string().uuid()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
    const rol = String((me as { rol?: string } | null)?.rol ?? "user");
    if (rol !== "admin" && rol !== "super_admin") {
      return NextResponse.json({ error: "Solo admin / super admin" }, { status: 403 });
    }

    const body = BodySchema.parse(await req.json());
    const { data: alert, error: aErr } = await supabase
      .from("matriz_edit_alertas")
      .select("id,matriz_row_id,revisado,snapshot_antes")
      .eq("id", body.id)
      .maybeSingle();
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });
    if (!alert) return NextResponse.json({ error: "Alerta no encontrada" }, { status: 404 });
    if ((alert as { revisado?: boolean }).revisado) {
      return NextResponse.json({ error: "Esta alerta ya fue cerrada" }, { status: 400 });
    }

    const snap = (alert as { snapshot_antes?: unknown }).snapshot_antes;
    if (!snap || typeof snap !== "object" || Array.isArray(snap)) {
      return NextResponse.json({ error: "Snapshot inválido" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(snap as Record<string, unknown>)) {
      if (MATRIZ_TRACKED_FIELD_SET.has(k)) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No hay campos para revertir" }, { status: 400 });
    }

    const rowId = (alert as { matriz_row_id: string }).matriz_row_id;
    const { error: uErr } = await supabase.from("matriz_cumplimiento").update(patch).eq("id", rowId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    const { error: cErr } = await supabase.from("matriz_edit_alertas").update({ revisado: true }).eq("id", body.id);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
