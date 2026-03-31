-- Ejecutar en Supabase SQL Editor
-- Campos mínimos adicionales para Matriz (según formato de referencia).
-- Nota: created_at ya es "fecha de carga" y fecha_normativa en normativa_docs es "fecha publicación" de la norma si se detecta.

alter table public.matriz_cumplimiento add column if not exists tipo_norma text;
alter table public.matriz_cumplimiento add column if not exists norma_nombre text;
alter table public.matriz_cumplimiento add column if not exists fecha_publicacion date;
alter table public.matriz_cumplimiento add column if not exists organismo_emisor text;
alter table public.matriz_cumplimiento add column if not exists resumen_experto text;
alter table public.matriz_cumplimiento add column if not exists campo_juridico text;
alter table public.matriz_cumplimiento add column if not exists observaciones text;
alter table public.matriz_cumplimiento add column if not exists proceso_actividad_relacionada text;
alter table public.matriz_cumplimiento add column if not exists sponsor text;
alter table public.matriz_cumplimiento add column if not exists responsable_proceso text;

-- Lo mismo en propuestas para que se transporten antes de aprobar
alter table public.propuestas_pendientes add column if not exists tipo_norma text;
alter table public.propuestas_pendientes add column if not exists norma_nombre text;
alter table public.propuestas_pendientes add column if not exists fecha_publicacion date;
alter table public.propuestas_pendientes add column if not exists organismo_emisor text;
alter table public.propuestas_pendientes add column if not exists resumen_experto text;
alter table public.propuestas_pendientes add column if not exists campo_juridico text;
alter table public.propuestas_pendientes add column if not exists observaciones text;
alter table public.propuestas_pendientes add column if not exists proceso_actividad_relacionada text;
alter table public.propuestas_pendientes add column if not exists sponsor text;
alter table public.propuestas_pendientes add column if not exists responsable_proceso text;

