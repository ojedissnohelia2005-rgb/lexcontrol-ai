-- Ejecutar en Supabase SQL Editor (opcional pero recomendado tras desplegar la app)
-- 1) Unifica PDFs viejos “por negocio” en la biblioteca global (misma lista para todos).
-- 2) Ajusta borrado RLS para poder eliminar normas con negocio_id NULL siendo admin/super_admin.

-- Paso A — descomenta si quieres mover todo al pool global:
-- update public.normativa_docs set negocio_id = null where negocio_id is not null;

-- Paso B — política de borrado (sustituye la de normativa-base-sistema si ya la ejecutaste)
drop policy if exists "normativa_delete_access" on public.normativa_docs;
create policy "normativa_delete_access" on public.normativa_docs for delete
using (
  (
    negocio_id is not null
    and public.has_negocio_access(negocio_id)
    and (
      coalesce(es_base_sistema, false) = false
      or public.is_admin_or_super_admin()
    )
  )
  or
  (
    negocio_id is null
    and public.is_admin_or_super_admin()
    and (
      coalesce(es_base_sistema, false) = false
      or public.is_admin_or_super_admin()
    )
  )
);
