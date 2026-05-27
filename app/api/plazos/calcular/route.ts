import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calcularPlazoDemo } from "@/lib/plazos-ecuador-demo";

const BodySchema = z.object({
  materia: z.enum(["cogep", "civil", "administrativo", "penal"]),
  procedimiento_id: z.string().min(1),
  fecha_inicio: z.string().min(8)
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = BodySchema.parse(await req.json());
    const result = calcularPlazoDemo({
      materia: body.materia,
      procedimientoId: body.procedimiento_id,
      fechaInicio: body.fecha_inicio
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
