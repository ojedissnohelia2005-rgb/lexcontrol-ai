-- Si al subir PDF sale: "new row violates row-level security policy"
-- Ejecuta este script en Supabase SQL Editor.
-- Re-crea helpers + políticas mínimas para insertar normativa y propuestas.

-- Helpers (idempotentes)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.rol = 'super_admin'
  );
$$;

create or replace function public.has_negocio_access(target_negocio uuid)
returns boolean
language sql
stable
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.negocios n
    where n.id = target_negocio
      and (n.created_by = auth.uid() or n.responsable_id = auth.uid())
  )
  or exists (
    select 1
    from public.negocio_accesos a
    where a.negocio_id = target_negocio
      and a.profile_id = auth.uid()
  );
$$;

-- Asegura RLS activo
alter table public.normativa_docs enable row level security;
alter table public.propuestas_pendientes enable row level security;

-- Normativa docs: select/insert/update
drop policy if exists "normativa_select_access" on public.normativa_docs;
create policy "normativa_select_access" on public.normativa_docs for select
using (negocio_id is null or public.has_negocio_access(negocio_id));

drop policy if exists "normativa_insert_access" on public.normativa_docs;
create policy "normativa_insert_access" on public.normativa_docs for insert
with check (negocio_id is null or public.has_negocio_access(negocio_id));

drop policy if exists "normativa_update_access" on public.normativa_docs;
create policy "normativa_update_access" on public.normativa_docs for update
using (negocio_id is null or public.has_negocio_access(negocio_id))
with check (negocio_id is null or public.has_negocio_access(negocio_id));

-- Propuestas: select/insert/update (triage)
drop policy if exists "propuestas_select_access" on public.propuestas_pendientes;
create policy "propuestas_select_access" on public.propuestas_pendientes for select
using (public.has_negocio_access(negocio_id));

drop policy if exists "propuestas_insert_access" on public.propuestas_pendientes;
create policy "propuestas_insert_access" on public.propuestas_pendientes for insert
with check (public.has_negocio_access(negocio_id));

drop policy if exists "propuestas_update_access" on public.propuestas_pendientes;
create policy "propuestas_update_access" on public.propuestas_pendientes for update
using (public.is_super_admin() or public.has_negocio_access(negocio_id))
with check (public.is_super_admin() or public.has_negocio_access(negocio_id));

