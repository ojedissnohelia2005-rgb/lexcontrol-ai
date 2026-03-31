import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  normativa_doc_ids: z.array(z.string().uuid()).min(1)
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: me } = await supabase.from("profiles").select("rol").eq("id", userData.user.id).maybeSingle();
    const rol = String((me as { rol?: string } | null)?.rol ?? "");
    if (rol !== "admin" && rol !== "super_admin") {
      return NextResponse.json({ error: "Solo admin/super admin puede eliminar normativa" }, { status: 403 });
    }

    const body = BodySchema.parse(await req.json());

    const admin = createSupabaseAdminClient();
    // fetch storage paths
    const { data: docs, error: dErr } = await admin
      .from("normativa_docs")
      .select("id,storage_path")
      .in("id", body.normativa_doc_ids);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean) as string[];
    if (paths.length > 0) {
      await admin.storage.from("evidencias-legales").remove(paths);
    }

    const { error: delErr } = await admin.from("normativa_docs").delete().in("id", body.normativa_doc_ids);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    await admin.from("audit_log").insert({
      usuario_id: userData.user.id,
      accion: "ELIMINAR_NORMATIVA_DOCS",
      tabla: "normativa_docs",
      registro_id: null,
      valor_nuevo: { ids: body.normativa_doc_ids }
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

