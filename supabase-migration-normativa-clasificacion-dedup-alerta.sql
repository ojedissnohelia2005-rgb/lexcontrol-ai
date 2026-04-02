-- Ejecutar en Supabase SQL Editor
-- Clasificación IA (ley/reglamento/…) en normativa cargada.
-- Tras ejecutarlo, la app puede leer clasificacion_documento (badges); sin esto, la lista de PDFs sigue funcionando.

alter table public.normativa_docs
  add column if not exists clasificacion_documento text;

comment on column public.normativa_docs.clasificacion_documento is
  'Clasificación inferida: ley, reglamento, decreto, resolucion, otro';
