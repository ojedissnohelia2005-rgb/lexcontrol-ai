import type { SupabaseClient } from "@supabase/supabase-js";

const COLS_MIN = "id,titulo,created_at,sha256,es_base_sistema";
const COLS_FULL = `${COLS_MIN},clasificacion_documento`;

export type NormativaDocListRow = {
  id: string;
  titulo: string | null;
  created_at: string;
  sha256: string | null;
  es_base_sistema?: boolean;
  clasificacion_documento?: string | null;
};

/** Lista normativa del negocio; si aún no existe la columna clasificacion_documento, reintenta sin ella. */
export async function fetchNormativaDocsForNegocio(
  supabase: SupabaseClient,
  negocioId: string,
  opts?: { ascending?: boolean }
) {
  const ascending = opts?.ascending ?? false;
  const q = supabase
    .from("normativa_docs")
    .select(COLS_FULL)
    .eq("negocio_id", negocioId)
    .order("created_at", { ascending });
  const first = await q;
  if (first.error && /clasificacion_documento/i.test(first.error.message)) {
    return supabase
      .from("normativa_docs")
      .select(COLS_MIN)
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending });
  }
  return first;
}

const MATRIZ_NORMA_COLS_MIN = "id,titulo,fuente_url,storage_path,created_at";
const MATRIZ_NORMA_COLS_FULL = `${MATRIZ_NORMA_COLS_MIN},clasificacion_documento`;

export type NormativaMiniRow = {
  id: string;
  titulo: string | null;
  fuente_url: string | null;
  storage_path: string | null;
  created_at: string;
  clasificacion_documento?: string | null;
};

/** Filas para matriz, propuestas o QnA (mismas columnas base). */
export async function fetchNormativaDocsMiniRows(
  supabase: SupabaseClient,
  negocioId: string,
  opts?: { limit?: number }
): Promise<{ data: NormativaMiniRow[] | null; error: { message: string } | null }> {
  let q = supabase
    .from("normativa_docs")
    .select(MATRIZ_NORMA_COLS_FULL)
    .eq("negocio_id", negocioId)
    .order("created_at", { ascending: false });
  if (opts?.limit != null) q = q.limit(opts.limit);
  const first = await q;
  if (first.error && /clasificacion_documento/i.test(first.error.message)) {
    let q2 = supabase
      .from("normativa_docs")
      .select(MATRIZ_NORMA_COLS_MIN)
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: false });
    if (opts?.limit != null) q2 = q2.limit(opts.limit);
    return q2;
  }
  return first;
}
