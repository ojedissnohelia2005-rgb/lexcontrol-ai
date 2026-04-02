-- LexControl AI - Supabase Schema (Ecuador 2026)
-- Execute in Supabase SQL Editor.

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'matriz_estado') then
    create type public.matriz_estado as enum ('cumplido','pendiente','no_aplica','en_proceso');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'prioridad_nivel') then
    create type public.prioridad_nivel as enum ('critico','alto','medio','bajo');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_role') then
    create type public.profile_role as enum ('super_admin','admin','user');
  end if;
end $$;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  nombre text,
  rol public.profile_role not null default 'user',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Negocios
create table if not exists public.negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sector text,
  puntaje_cumplimiento numeric,
  responsable_id uuid references public.profiles(id),
  detalles_negocio text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Accesos por negocio (para admins normales con acceso específico)
create table if not exists public.negocio_accesos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  nivel public.profile_role not null default 'admin',
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (negocio_id, profile_id)
);

-- Solicitudes de acceso a negocios (aprobadas por super_admin)
create table if not exists public.solicitudes_acceso (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  motivo text,
  estado text not null default 'pendiente', -- pendiente/aprobada/rechazada
  resuelto_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Matriz de cumplimiento
create table if not exists public.matriz_cumplimiento (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  articulo text not null,
  requisito text not null,
  sancion text,
  multa_estimada_usd numeric,
  impacto_economico int check (impacto_economico between 1 and 10),
  probabilidad_incumplimiento int check (probabilidad_incumplimiento between 1 and 5),
  prioridad public.prioridad_nivel,
  estado public.matriz_estado not null default 'pendiente',
  evidencia_url text,
  cita_textual text,
  link_fuente_oficial text,
  fuente_verificada_url text,
  gerencia_competente text,
  area_competente text,
  responsable text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Propuestas pendientes (pre-aprobación IA)
create table if not exists public.propuestas_pendientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  articulo text not null,
  requisito text not null,
  sancion text,
  multa_estimada_usd numeric,
  impacto_economico int,
  probabilidad_incumplimiento int,
  prioridad public.prioridad_nivel,
  estado public.matriz_estado not null default 'pendiente',
  evidencia_url text,
  cita_textual text,
  link_fuente_oficial text,
  fuente_verificada_url text,
  gerencia_competente text,
  area_competente text,
  extra jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Memoria normativa / PDFs y vectores (vector opcional; guardamos embeddings como jsonb por simplicidad)
create table if not exists public.normativa_docs (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references public.negocios(id) on delete set null,
  titulo text,
  clasificacion_documento text,
  fuente_url text,
  storage_path text,
  mime_type text,
  sha256 text,
  texto_extraido text,
  embedding jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Alertas legales (legal-watcher)
create table if not exists public.alertas_legales (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  resumen text,
  link_oficial text,
  impacto_sector text,
  fecha timestamptz not null default now(),
  analisis_veracidad text,
  verificado boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auditoría
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id),
  accion text not null,
  tabla text not null,
  registro_id uuid,
  fecha timestamptz not null default now(),
  valor_anterior jsonb,
  valor_nuevo jsonb
);

-- Auditoría externa: reportes subidos + riesgos identificados
create table if not exists public.auditoria_externa_reportes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  titulo text not null,
  storage_path text,
  resumen_ia text,
  riesgos_json jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Helpers: updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_set_updated_at') then
    create trigger profiles_set_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'negocios_set_updated_at') then
    create trigger negocios_set_updated_at before update on public.negocios
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'matriz_set_updated_at') then
    create trigger matriz_set_updated_at before update on public.matriz_cumplimiento
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'propuestas_set_updated_at') then
    create trigger propuestas_set_updated_at before update on public.propuestas_pendientes
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- Auto-create profile on signup; set super_admin by email allowlist
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.negocios enable row level security;
alter table public.negocio_accesos enable row level security;
alter table public.solicitudes_acceso enable row level security;
alter table public.matriz_cumplimiento enable row level security;
alter table public.propuestas_pendientes enable row level security;
alter table public.normativa_docs enable row level security;
alter table public.alertas_legales enable row level security;
alter table public.audit_log enable row level security;
alter table public.auditoria_externa_reportes enable row level security;

-- Profile policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
using (auth.uid() = id);

-- Helpers for access checks
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
  or exists (select 1 from public.negocios n where n.id = target_negocio and (n.created_by = auth.uid() or n.responsable_id = auth.uid()))
  or exists (select 1 from public.negocio_accesos a where a.negocio_id = target_negocio and a.profile_id = auth.uid());
$$;

-- Negocios policies
drop policy if exists "negocios_select_access" on public.negocios;
create policy "negocios_select_access" on public.negocios for select
using (public.has_negocio_access(id));

drop policy if exists "negocios_insert_owner" on public.negocios;
create policy "negocios_insert_owner" on public.negocios for insert
with check (auth.uid() = created_by);

drop policy if exists "negocios_update_access" on public.negocios;
create policy "negocios_update_access" on public.negocios for update
using (public.has_negocio_access(id));

drop policy if exists "negocios_delete_super_admin" on public.negocios;
create policy "negocios_delete_super_admin" on public.negocios for delete
using (public.is_super_admin());

-- Accesos & solicitudes (solo super_admin gestiona; usuario puede pedir acceso)
drop policy if exists "solicitudes_insert_own" on public.solicitudes_acceso;
create policy "solicitudes_insert_own" on public.solicitudes_acceso for insert
with check (auth.uid() = profile_id);

drop policy if exists "solicitudes_select_super_admin" on public.solicitudes_acceso;
create policy "solicitudes_select_super_admin" on public.solicitudes_acceso for select
using (public.is_super_admin() or auth.uid() = profile_id);

drop policy if exists "solicitudes_update_super_admin" on public.solicitudes_acceso;
create policy "solicitudes_update_super_admin" on public.solicitudes_acceso for update
using (public.is_super_admin());

drop policy if exists "accesos_all_super_admin" on public.negocio_accesos;
create policy "accesos_all_super_admin" on public.negocio_accesos for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Matriz policies
drop policy if exists "matriz_select_access" on public.matriz_cumplimiento;
create policy "matriz_select_access" on public.matriz_cumplimiento for select
using (public.has_negocio_access(negocio_id));

drop policy if exists "matriz_insert_access" on public.matriz_cumplimiento;
create policy "matriz_insert_access" on public.matriz_cumplimiento for insert
with check (public.has_negocio_access(negocio_id));

drop policy if exists "matriz_update_access" on public.matriz_cumplimiento;
create policy "matriz_update_access" on public.matriz_cumplimiento for update
using (public.has_negocio_access(negocio_id));

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

drop policy if exists "matriz_delete_super_admin" on public.matriz_cumplimiento;
drop policy if exists "matriz_delete_admin" on public.matriz_cumplimiento;
create policy "matriz_delete_admin" on public.matriz_cumplimiento for delete
using (public.has_negocio_access(negocio_id) and public.is_admin_or_super_admin());

-- Propuestas: lectura/insersión/update con acceso al negocio; borrado restringido
drop policy if exists "propuestas_select_access" on public.propuestas_pendientes;
create policy "propuestas_select_access" on public.propuestas_pendientes for select
using (public.has_negocio_access(negocio_id));

drop policy if exists "propuestas_insert_access" on public.propuestas_pendientes;
create policy "propuestas_insert_access" on public.propuestas_pendientes for insert
with check (public.has_negocio_access(negocio_id));

drop policy if exists "propuestas_update_super_admin" on public.propuestas_pendientes;
drop policy if exists "propuestas_update_access" on public.propuestas_pendientes;
create policy "propuestas_update_access" on public.propuestas_pendientes for update
using (public.has_negocio_access(negocio_id));

drop policy if exists "propuestas_delete_super_admin" on public.propuestas_pendientes;
create policy "propuestas_delete_super_admin" on public.propuestas_pendientes for delete
using (public.is_super_admin());

-- Normativa docs
drop policy if exists "normativa_select_access" on public.normativa_docs;
create policy "normativa_select_access" on public.normativa_docs for select
using (negocio_id is null or public.has_negocio_access(negocio_id));

drop policy if exists "normativa_insert_access" on public.normativa_docs;
create policy "normativa_insert_access" on public.normativa_docs for insert
with check (negocio_id is null or public.has_negocio_access(negocio_id));

-- Alertas legales: visible para autenticados; insert/update solo super_admin (o edge job)
drop policy if exists "alertas_select_authed" on public.alertas_legales;
create policy "alertas_select_authed" on public.alertas_legales for select
using (auth.role() = 'authenticated');

drop policy if exists "alertas_mutate_super_admin" on public.alertas_legales;
create policy "alertas_mutate_super_admin" on public.alertas_legales for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Audit log: solo super_admin lo ve completo; usuarios ven sus acciones
drop policy if exists "audit_select" on public.audit_log;
create policy "audit_select" on public.audit_log for select
using (public.is_super_admin() or usuario_id = auth.uid());

drop policy if exists "audit_insert_authed" on public.audit_log;
create policy "audit_insert_authed" on public.audit_log for insert
with check (auth.role() = 'authenticated');

-- Auditoría externa reportes: access by negocio; insert by access; update/delete super_admin
drop policy if exists "audext_select" on public.auditoria_externa_reportes;
create policy "audext_select" on public.auditoria_externa_reportes for select
using (public.has_negocio_access(negocio_id));

drop policy if exists "audext_insert" on public.auditoria_externa_reportes;
create policy "audext_insert" on public.auditoria_externa_reportes for insert
with check (public.has_negocio_access(negocio_id));

drop policy if exists "audext_update_super_admin" on public.auditoria_externa_reportes;
create policy "audext_update_super_admin" on public.auditoria_externa_reportes for update
using (public.is_super_admin());

-- Notes:
-- 1) Create Supabase Storage bucket `evidencias-legales` in Dashboard.
-- 2) If you enable email confirmation, user must confirm before session works.

-- Promover Super Admins existentes (ejecutar tras actualizar allowlist)
update public.profiles
set rol = 'super_admin'
where lower(coalesce(email, '')) in (
  'nohe.ojedis@cumplimientonormativo.edu.ec',
  'ortix@cumplimientonormativo.edu.ec',
  'ojedissnohelia2005@gmail.com',
  'mathias.martinez@uees.edu.ec'
);

-- Contexto de rubro / normativa a actualizar (ejecutar si la tabla ya existía sin estas columnas)
alter table public.negocios add column if not exists regulacion_actividades_especiales text;
alter table public.negocios add column if not exists normativa_actualizar_nota text;
alter table public.negocios add column if not exists normativa_actualizar_urls text;
alter table public.negocios add column if not exists guia_fuentes_ia text;

