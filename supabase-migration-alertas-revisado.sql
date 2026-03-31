-- Ejecutar en Supabase SQL Editor
-- Marca alertas como revisables (para que Notificaciones pueda saber si hay pendientes).

alter table public.alertas_legales
  add column if not exists revisado boolean;

alter table public.alertas_actualizacion_normativa
  add column if not exists revisado boolean;

