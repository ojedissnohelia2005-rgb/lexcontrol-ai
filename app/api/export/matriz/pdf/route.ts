import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectiveMatrizResponsableCompliance, type ProfileMini } from "@/lib/assignable-profile-label";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const url = new URL(req.url);
    const negocio_id = z.string().uuid().parse(url.searchParams.get("negocio_id"));

    const { data: rows, error } = await supabase
      .from("matriz_cumplimiento")
      .select(
        "estado,articulo,requisito,sancion,multa_estimada_usd,evidencia_url,responsable,supervisor_legal_id,prioridad,fuente_verificada_url"
      )
      .eq("negocio_id", negocio_id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const raw = rows ?? [];
    const supIds = [...new Set(raw.map((r) => r.supervisor_legal_id as string | null).filter(Boolean))] as string[];
    const profileById = new Map<string, ProfileMini>();
    if (supIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id,nombre,email").in("id", supIds);
      for (const p of (profs ?? []) as ProfileMini[]) profileById.set(p.id, p);
    }

    const trs = raw
      .map((r) => {
        const resp = effectiveMatrizResponsableCompliance(
          r.responsable,
          r.supervisor_legal_id,
          profileById
        );
        return `<tr><td>${esc(String(r.estado))}</td><td>${esc(String(r.articulo))}</td><td>${esc(String(r.requisito))}</td><td>${esc(String(r.sancion ?? ""))}</td><td>${r.multa_estimada_usd != null ? esc(String(r.multa_estimada_usd)) : "—"}</td><td>${esc(String(resp))}</td><td>${esc(String(r.prioridad ?? ""))}</td></tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Matriz de cumplimiento</title>
<style>body{font-family:system-ui,sans-serif;color:#333;background:#fffdf9;padding:24px;} h1{font-size:18px;} table{width:100%;border-collapse:collapse;font-size:12px;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f5e6e6;}</style></head><body>
<h1>LexControl AI · Matriz de Cumplimiento</h1>
<p>Negocio: <strong>${esc(negocio_id)}</strong> · Use imprimir → Guardar como PDF en el navegador.</p>
<table><thead><tr><th>Estado</th><th>Artículo</th><th>Requisito</th><th>Sanción</th><th>Multa USD</th><th>Responsable</th><th>Prioridad</th></tr></thead><tbody>${trs || `<tr><td colspan="7">Sin filas</td></tr>`}</tbody></table>
<script>window.onload=function(){/* opcional: window.print(); */}</script>
</body></html>`;

    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
