-- FIX: "new row violates row-level security policy" al subir PDFs a Supabase Storage
-- Ejecuta en Supabase SQL Editor.
-- Crea/asegura bucket `evidencias-legales` y agrega policies sobre storage.objects.

-- 1) Bucket (idempotente)
insert into storage.buckets (id, name, public)
values ('evidencias-legales', 'evidencias-legales', true)
on conflict (id) do update set public = excluded.public;

-- 2) Policies para objetos del bucket
-- Nota: storage.objects tiene RLS y requiere policies explícitas.

-- SELECT: permitir lectura pública si el bucket es public.
drop policy if exists "public read evidencias-legales" on storage.objects;
create policy "public read evidencias-legales"
on storage.objects for select
using (bucket_id = 'evidencias-legales');

-- INSERT: permitir a usuarios autenticados subir archivos al bucket.
drop policy if exists "auth upload evidencias-legales" on storage.objects;
create policy "auth upload evidencias-legales"
on storage.objects for insert
to authenticated
with check (bucket_id = 'evidencias-legales');

-- UPDATE: solo el owner puede actualizar metadata/archivo.
drop policy if exists "owner update evidencias-legales" on storage.objects;
create policy "owner update evidencias-legales"
on storage.objects for update
to authenticated
using (bucket_id = 'evidencias-legales' and owner = auth.uid())
with check (bucket_id = 'evidencias-legales' and owner = auth.uid());

-- DELETE: solo el owner puede borrar.
drop policy if exists "owner delete evidencias-legales" on storage.objects;
create policy "owner delete evidencias-legales"
on storage.objects for delete
to authenticated
using (bucket_id = 'evidencias-legales' and owner = auth.uid());

