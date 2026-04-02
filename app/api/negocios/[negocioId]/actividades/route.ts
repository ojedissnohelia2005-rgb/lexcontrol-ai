import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteCtx = { params: Promise<{ negocioId: string }> };

const BodySchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().max(2000).optional()
});

async function assertNegocioAccess(negocioId: string) {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { supabase, user: null as null, negocioOk: false, error: "No autenticado" as const };
  }
  const { data: neg, error: nErr } = await supabase.from("negocios").select("id").eq("id", negocioId).maybeSingle();
  if (nErr || !neg) {
    return { supabase, user: userData.user, negocioOk: false, error: "Sin acceso o negocio inexistente" as const };
  }
  return { supabase, user: userData.user, negocioOk: true, error: null as null };
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { negocioId } = await ctx.params;
  const gate = await assertNegocioAccess(negocioId);
  if (!gate.user) return NextResponse.json({ error: gate.error }, { status: 401 });
  if (!gate.negocioOk) return NextResponse.json({ error: gate.error }, { status: 403 });

  const runSelect = async () => {
    try {
      const admin = createSupabaseAdminClient();
      return await admin
        .from("negocio_actividades")
        .select("id,nombre,descripcion,created_at")
        .eq("negocio_id", negocioId)
        .order("created_at", { ascending: true });
    } catch {
      return await gate.supabase
        .from("negocio_actividades")
        .select("id,nombre,descripcion,created_at")
        .eq("negocio_id", negocioId)
        .order("created_at", { ascending: true });
    }
  };

  const { data, error } = await runSelect();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ actividades: data ?? [] });
}

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const { negocioId } = await ctx.params;
    const gate = await assertNegocioAccess(negocioId);
    if (!gate.user) return NextResponse.json({ error: gate.error }, { status: 401 });
    if (!gate.negocioOk) return NextResponse.json({ error: gate.error }, { status: 403 });

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const runInsert = async () => {
      const row = {
        negocio_id: negocioId,
        nombre: body.nombre,
        descripcion: body.descripcion ?? null
      };
      try {
        const admin = createSupabaseAdminClient();
        return await admin.from("negocio_actividades").insert(row).select("id,nombre,descripcion,created_at").single();
      } catch {
        return await gate.supabase.from("negocio_actividades").insert(row).select("id,nombre,descripcion,created_at").single();
      }
    };

    const { data, error } = await runInsert();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ actividad: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
