-- Ejecutar en Supabase SQL Editor
-- Clave de registro por negocio para altas de usuarios.

alter table public.negocios
  add column if not exists clave_registro text,
  add column if not exists clave_registro_ultima_uso_at timestamptz;

