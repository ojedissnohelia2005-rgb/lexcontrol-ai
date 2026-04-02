-- Ejecutar en Supabase SQL Editor
-- 1) Actividades específicas por negocio
-- 2) Alertas de posible actualización de normativa (vigilancia legal)
--
-- Nota: PostgreSQL NO acepta "CREATE POLICY IF NOT EXISTS". Se usa DROP + CREATE.

create table if not exists public.negocio_actividades (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  nombre text not null,
  descripcion text,
  created_at timestamptz not null default now()
);

alter table public.negocio_actividades enable row level security;

drop policy if exists "actividades_select" on public.negocio_actividades;
create policy "actividades_select" on public.negocio_actividades
for select using (public.has_negocio_access(negocio_id));

drop policy if exists "actividades_insert" on public.negocio_actividades;
create policy "actividades_insert" on public.negocio_actividades
for insert with check (public.has_negocio_access(negocio_id));

drop policy if exists "actividades_update" on public.negocio_actividades;
create policy "actividades_update" on public.negocio_actividades
for update using (public.has_negocio_access(negocio_id));

drop policy if exists "actividades_delete" on public.negocio_actividades;
create policy "actividades_delete" on public.negocio_actividades
for delete using (public.has_negocio_access(negocio_id));

alter table public.matriz_cumplimiento
  add column if not exists actividad_id uuid references public.negocio_actividades(id) on delete set null;

alter table public.propuestas_pendientes
  add column if not exists actividad_id uuid references public.negocio_actividades(id) on delete set null;

-- Alertas de posible actualización de normativa
create table if not exists public.alertas_actualizacion_normativa (
  id uuid primary key default gen_random_uuid(),
  normativa_doc_id uuid not null references public.normativa_docs(id) on delete cascade,
  tiene_posible_actualizacion boolean not null default true,
  nivel_confianza numeric,
  comentario text,
  fuentes jsonb,
  created_at timestamptz not null default now()
);

alter table public.alertas_actualizacion_normativa enable row level security;

drop policy if exists "alertas_act_select" on public.alertas_actualizacion_normativa;
create policy "alertas_act_select" on public.alertas_actualizacion_normativa
for select using (
  public.is_super_admin()
  or exists (
    select 1
    from public.normativa_docs d
    where d.id = normativa_doc_id
      and (d.negocio_id is null or public.has_negocio_access(d.negocio_id))
  )
);

drop policy if exists "alertas_act_insert" on public.alertas_actualizacion_normativa;
create policy "alertas_act_insert" on public.alertas_actualizacion_normativa
for insert with check (auth.role() = 'authenticated');
