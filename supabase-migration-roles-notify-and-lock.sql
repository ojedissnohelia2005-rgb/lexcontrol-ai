-- Ejecutar en Supabase SQL Editor
-- 1) Notificar nuevos registros a Super Admin vía audit_log
-- 2) Bloquear cambios de matriz_cumplimiento.responsable para usuarios no admin/super_admin

-- 1) Notificación: extender handle_new_user para escribir en audit_log
-- Nota: Reemplaza SOLO el cuerpo del function si ya existe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_email text;
  v_role public.profile_role;
begin
  v_email := lower(new.email);
  v_role := 'user';
  if v_email in (
    'nohe.ojedis@cumplimientonormativo.edu.ec',
    'ortix@cumplimientonormativo.edu.ec',
    'ojedissnohelia2005@gmail.com',
    'mathias.martinez@uees.edu.ec'
  ) then
    v_role := 'super_admin';
  end if;

  insert into public.profiles (id, email, nombre, rol, avatar_url)
  values (new.id, v_email, coalesce(new.raw_user_meta_data->>'nombre', ''), v_role, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update set email = excluded.email;

  -- "Notificación" para super admins (visible en Transparencia -> Audit log)
  insert into public.audit_log (usuario_id, accion, tabla, registro_id, valor_nuevo)
  values (new.id, 'NEW_USER_SIGNUP', 'profiles', new.id, jsonb_build_object('email', v_email, 'rol_inicial', v_role));

  return new;
end;
$$;

-- 2) Lock responsable: trigger que solo permite admin/super_admin editar el campo responsable
create or replace function public.block_responsable_update_non_admin()
returns trigger
language plpgsql
security definer
as $$
declare
  v_role public.profile_role;
begin
  -- si no cambia, ok
  if coalesce(new.responsable, '') = coalesce(old.responsable, '') then
    return new;
  end if;

  select rol into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    raise exception 'No profile for user';
  end if;

  if v_role <> 'admin' and v_role <> 'super_admin' then
    raise exception 'Solo admin/super_admin puede modificar responsable';
  end if;
  return new;
end;
$$;

drop trigger if exists matriz_block_responsable_update on public.matriz_cumplimiento;
create trigger matriz_block_responsable_update
before update on public.matriz_cumplimiento
for each row
execute function public.block_responsable_update_non_admin();

