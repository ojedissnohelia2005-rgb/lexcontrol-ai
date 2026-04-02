-- Alertas cuando un usuario (no admin) edita la matriz: admin/super_admin pueden marcar revisado o deshacer.

create table if not exists public.matriz_edit_alertas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  matriz_row_id uuid not null references public.matriz_cumplimiento(id) on delete cascade,
  editado_por uuid references public.profiles(id) on delete set null,
  campos_afectados text[] not null default '{}',
  snapshot_antes jsonb not null default '{}'::jsonb,
  snapshot_despues jsonb not null default '{}'::jsonb,
  revisado boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists matriz_edit_alertas_negocio_idx on public.matriz_edit_alertas (negocio_id);
create index if not exists matriz_edit_alertas_revisado_idx on public.matriz_edit_alertas (revisado) where revisado = false;

alter table public.matriz_edit_alertas enable row level security;

drop policy if exists "matriz_edit_alertas_select" on public.matriz_edit_alertas;
create policy "matriz_edit_alertas_select" on public.matriz_edit_alertas
for select using (
  public.is_super_admin()
  or public.is_admin_or_super_admin()
);

drop policy if exists "matriz_edit_alertas_insert" on public.matriz_edit_alertas;
create policy "matriz_edit_alertas_insert" on public.matriz_edit_alertas
for insert with check (public.has_negocio_access(negocio_id));

drop policy if exists "matriz_edit_alertas_update_admin" on public.matriz_edit_alertas;
create policy "matriz_edit_alertas_update_admin" on public.matriz_edit_alertas
for update using (public.is_admin_or_super_admin() or public.is_super_admin())
with check (public.is_admin_or_super_admin() or public.is_super_admin());
