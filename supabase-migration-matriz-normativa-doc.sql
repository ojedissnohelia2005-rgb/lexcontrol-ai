-- Ejecutar en Supabase SQL Editor
-- Permite rastrear en la matriz de qué norma/documento salió el requisito.

alter table public.matriz_cumplimiento
add column if not exists normativa_doc_id uuid references public.normativa_docs(id) on delete set null;

