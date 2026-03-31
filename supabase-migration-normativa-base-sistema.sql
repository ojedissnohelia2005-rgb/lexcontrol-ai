-- Ejecutar en Supabase SQL Editor
-- Marca ciertas normas como "base del sistema" y restringe su borrado.

alter table public.normativa_docs
  add column if not exists es_base_sistema boolean not null default false;

-- Helper: true si el perfil es admin o super_admin
create or replace function public.is_admin_or_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.rol in ('admin','super_admin')
  );
$$;

-- Delete de normativa:
-- - Cualquiera con acceso al negocio puede borrar normas normales (es_base_sistema = false)
-- - Solo admin/super_admin puede borrar normas base_sistema = true
drop policy if exists "normativa_delete_access" on public.normativa_docs;
create policy "normativa_delete_access" on public.normativa_docs for delete
using (
  negocio_id is not null
  and public.has_negocio_access(negocio_id)
  and (
    es_base_sistema = false
    or public.is_admin_or_super_admin()
  )
);

