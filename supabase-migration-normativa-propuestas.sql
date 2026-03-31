-- Ejecutar en Supabase SQL Editor después de supabase-schema.sql
-- Normativa: versionado / reemplazo; propuestas: triage y supervisor legal; matriz: supervisor

alter table public.normativa_docs add column if not exists fecha_normativa date;
alter table public.normativa_docs add column if not exists fingerprint_norma text;
alter table public.normativa_docs add column if not exists archived boolean not null default false;

alter table public.propuestas_pendientes add column if not exists normativa_doc_id uuid references public.normativa_docs(id) on delete set null;
alter table public.propuestas_pendientes add column if not exists aplica_usuario boolean;
alter table public.propuestas_pendientes add column if not exists asignacion_gerencia text;
alter table public.propuestas_pendientes add column if not exists asignacion_jefatura text;
alter table public.propuestas_pendientes add column if not exists supervisor_legal_id uuid references public.profiles(id) on delete set null;

alter table public.matriz_cumplimiento add column if not exists supervisor_legal_id uuid references public.profiles(id) on delete set null;

-- Políticas normativa: update/delete para reemplazo autorizado
drop policy if exists "normativa_update_access" on public.normativa_docs;
create policy "normativa_update_access" on public.normativa_docs for update
using (negocio_id is null or public.has_negocio_access(negocio_id))
with check (negocio_id is null or public.has_negocio_access(negocio_id));

drop policy if exists "normativa_delete_access" on public.normativa_docs;
create policy "normativa_delete_access" on public.normativa_docs for delete
using (negocio_id is not null and public.has_negocio_access(negocio_id));

-- Propuestas: quien tenga acceso al negocio puede actualizar triage (no solo super_admin)
drop policy if exists "propuestas_update_super_admin" on public.propuestas_pendientes;
create policy "propuestas_update_access" on public.propuestas_pendientes for update
using (public.is_super_admin() or public.has_negocio_access(negocio_id))
with check (public.is_super_admin() or public.has_negocio_access(negocio_id));
