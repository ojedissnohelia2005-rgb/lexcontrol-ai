import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ negocioId: string }> };

const BodySchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().max(2000).optional()
});

export async function GET(_req: Request, ctx: RouteCtx) {
  const { negocioId } = await ctx.params;
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("negocio_actividades")
    .select("id,nombre,descripcion,created_at")
    .eq("negocio_id", negocioId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ actividades: data ?? [] });
}

export async function POST(req: Request, ctx: RouteCtx) {
  const { negocioId } = await ctx.params;
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = BodySchema.parse(await req.json());
  const { data, error } = await supabase
    .from("negocio_actividades")
    .insert({ negocio_id: negocioId, nombre: body.nombre, descripcion: body.descripcion ?? null })
    .select("id,nombre,descripcion,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ actividad: data });
}

