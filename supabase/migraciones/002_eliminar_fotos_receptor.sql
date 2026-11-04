-- Para proyectos creados con la primera versión de schema.sql. Ejecutar una sola vez.
-- Agrega: quién recibió el producto, fotos de evidencia del envío y eliminar casos.

alter table public.casos add column recibido_por text;
update public.casos set recibido_por = 'Sin registrar' where recibido_por is null;
alter table public.casos alter column recibido_por set not null;
alter table public.casos add constraint casos_recibido_por check (length(trim(recibido_por)) > 0);

alter table public.casos add column fotos_envio text[] not null default '{}';
-- NOT VALID: los casos enviados antes de este cambio no tienen fotos y se conservan.
-- La regla aplica a los casos nuevos y a cualquier edición de los anteriores.
alter table public.casos add constraint casos_envio_con_fotos check (
  case when fecha_envio is null then cardinality(fotos_envio) = 0
       else cardinality(fotos_envio) between 1 and 5 end
) not valid;

grant delete on public.casos to authenticated;
create policy casos_borrar on public.casos for delete to authenticated using (true);

create policy guias_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'guias');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 5242880, array['image/jpeg']);

create policy evidencias_leer on storage.objects for select to authenticated
  using (bucket_id = 'evidencias');
create policy evidencias_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias');
create policy evidencias_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias');
