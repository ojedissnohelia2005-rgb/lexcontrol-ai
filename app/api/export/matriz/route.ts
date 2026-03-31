import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const QuerySchema = z.object({
  negocio_id: z.string().uuid()
});

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = [
    "estado",
    "articulo",
    "requisito",
    "sancion",
    "multa_estimada_usd",
    "evidencia_url",
    "responsable",
    "prioridad",
    "fuente_verificada_url",
    "link_fuente_oficial"
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const url = new URL(req.url);
    const q = QuerySchema.parse({ negocio_id: url.searchParams.get("negocio_id") });

    const { data, error } = await supabase
      .from("matriz_cumplimiento")
      .select(
        "estado,articulo,requisito,sancion,multa_estimada_usd,evidencia_url,responsable,prioridad,fuente_verificada_url,link_fuente_oficial"
      )
      .eq("negocio_id", q.negocio_id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const csv = toCsv((data ?? []) as Array<Record<string, unknown>>);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="matriz_${q.negocio_id}.csv"`
      }
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

