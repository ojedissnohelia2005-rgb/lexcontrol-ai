import { NextResponse } from "next/server";
import { z } from "zod";
import { MATRIZ_TRACKED_FIELD_SET } from "@/lib/matriz-tracked-fields";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  negocio_id: z.string().uuid(),
  matriz_row_id: z.string().uuid(),
  campos_afectados: z.array(z.string()).min(1),
  snapshot_antes: z.record(z.unknown()),
  snapshot_despues: z.record(z.unknown())
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
    const rol = String((me as { rol?: string } | null)?.rol ?? "user");
    if (rol === "admin" || rol === "super_admin") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const body = BodySchema.parse(await req.json());
    for (const k of body.campos_afectados) {
      if (!MATRIZ_TRACKED_FIELD_SET.has(k)) {
        return NextResponse.json({ error: "Campo no permitido" }, { status: 400 });
      }
    }

    const { data: row, error: rErr } = await supabase
      .from("matriz_cumplimiento")
      .select("id,negocio_id")
      .eq("id", body.matriz_row_id)
      .maybeSingle();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });
    if (!row || (row as { negocio_id: string }).negocio_id !== body.negocio_id) {
      return NextResponse.json({ error: "Fila no encontrada o sin acceso" }, { status: 403 });
    }

    const { error: insErr } = await supabase.from("matriz_edit_alertas").insert({
      negocio_id: body.negocio_id,
      matriz_row_id: body.matriz_row_id,
      editado_por: userData.user.id,
      campos_afectados: body.campos_afectados,
      snapshot_antes: body.snapshot_antes,
      snapshot_despues: body.snapshot_despues,
      revisado: false
    });
    if (insErr) {
      if (insErr.message.includes("does not exist") || insErr.message.includes("matriz_edit_alertas")) {
        return NextResponse.json(
          {
            error:
              "Falta la tabla matriz_edit_alertas. Ejecuta supabase-migration-matriz-edit-alertas.sql en el SQL Editor de Supabase."
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
