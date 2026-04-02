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

/**
 * Biblioteca normativa compartida (misma para todos los negocios): negocio_id IS NULL.
 * La IA filtra qué aplica al negocio al mapear / generar propuestas.
 */
export async function fetchGlobalNormativaDocsList(
  supabase: SupabaseClient,
  opts?: { ascending?: boolean }
) {
  const ascending = opts?.ascending ?? false;
  const q = supabase.from("normativa_docs").select(COLS_FULL).is("negocio_id", null).order("created_at", { ascending });
  const first = await q;
  if (first.error && /clasificacion_documento/i.test(first.error.message)) {
    return supabase.from("normativa_docs").select(COLS_MIN).is("negocio_id", null).order("created_at", { ascending });
  }
  return first;
}

/** @deprecated Usar fetchGlobalNormativaDocsList; la lista ya no es por negocio. */
export async function fetchNormativaDocsForNegocio(
  supabase: SupabaseClient,
  _negocioId: string,
  opts?: { ascending?: boolean }
) {
  return fetchGlobalNormativaDocsList(supabase, opts);
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

/**
 * Mini filas para QnA: solo biblioteca global.
 * Para matriz/propuestas usa fetchNormativaDocsMiniRowsForBusiness (global + legado por negocio).
 */
export async function fetchNormativaDocsMiniRows(
  supabase: SupabaseClient,
  _negocioId: string,
  opts?: { limit?: number }
): Promise<{ data: NormativaMiniRow[] | null; error: { message: string } | null }> {
  let q = supabase
    .from("normativa_docs")
    .select(MATRIZ_NORMA_COLS_FULL)
    .is("negocio_id", null)
    .order("created_at", { ascending: false });
  if (opts?.limit != null) q = q.limit(opts.limit);
  const first = await q;
  if (first.error && /clasificacion_documento/i.test(first.error.message)) {
    let q2 = supabase
      .from("normativa_docs")
      .select(MATRIZ_NORMA_COLS_MIN)
      .is("negocio_id", null)
      .order("created_at", { ascending: false });
    if (opts?.limit != null) q2 = q2.limit(opts.limit);
    return q2;
  }
  return first;
}

/** Resuelve títulos de normas en matriz/propuestas: global + documentos antiguos ligados al negocio. */
export async function fetchNormativaDocsMiniRowsForBusiness(
  supabase: SupabaseClient,
  negocioId: string
): Promise<{ data: NormativaMiniRow[] | null; error: { message: string } | null }> {
  let q = supabase
    .from("normativa_docs")
    .select(MATRIZ_NORMA_COLS_FULL)
    .or(`negocio_id.is.null,negocio_id.eq.${negocioId}`)
    .order("created_at", { ascending: false });
  const first = await q;
  if (first.error && /clasificacion_documento/i.test(first.error.message)) {
    return supabase
      .from("normativa_docs")
      .select(MATRIZ_NORMA_COLS_MIN)
      .or(`negocio_id.is.null,negocio_id.eq.${negocioId}`)
      .order("created_at", { ascending: false });
  }
  return first;
}
