-- Ejecutar en Supabase SQL Editor
-- 1) Quitar bloqueo: cualquier usuario con acceso al negocio puede editar columnas de responsable en matriz (coherente con app).
-- 2) Borrar filas de matriz: admin y super_admin (con acceso al negocio).
-- 3) Propuestas pendientes: actualizar triage con acceso al negocio (no solo super_admin).

create or replace function public.is_admin_or_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.rol in ('admin', 'super_admin')
  );
$$;

drop trigger if exists matriz_block_responsable_update on public.matriz_cumplimiento;
drop function if exists public.block_responsable_update_non_admin();

drop policy if exists "matriz_delete_super_admin" on public.matriz_cumplimiento;
drop policy if exists "matriz_delete_admin" on public.matriz_cumplimiento;
create policy "matriz_delete_admin" on public.matriz_cumplimiento for delete
using (public.has_negocio_access(negocio_id) and public.is_admin_or_super_admin());

drop policy if exists "propuestas_update_super_admin" on public.propuestas_pendientes;
drop policy if exists "propuestas_update_access" on public.propuestas_pendientes;
create policy "propuestas_update_access" on public.propuestas_pendientes for update
using (public.has_negocio_access(negocio_id));
