import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  bucket: z.string().min(1),
  folder: z.string().min(1).optional()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    const metaRaw = form.get("meta");
    const meta = BodySchema.parse(metaRaw ? JSON.parse(String(metaRaw)) : { bucket: "evidencias-legales" });

    if (!(file instanceof File)) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
    const folder = (meta.folder ?? "evidencias").replace(/[^a-zA-Z0-9/_\-]/g, "_");
    const storagePath = `${folder}/${userData.user.id}/${Date.now()}-${safeName}`;

    const admin = createSupabaseAdminClient();
    const { error: upErr } = await admin.storage.from(meta.bucket).upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
      cacheControl: "3600"
    });
    if (upErr) return NextResponse.json({ error: `Storage upload: ${upErr.message}` }, { status: 400 });

    const { data: pub } = admin.storage.from(meta.bucket).getPublicUrl(storagePath);
    return NextResponse.json({ ok: true, storage_path: storagePath, public_url: pub.publicUrl || null });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

