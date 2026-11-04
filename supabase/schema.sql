-- Sistema de garantías · Enjoy Videogames
-- Pegar completo en Supabase > SQL Editor y ejecutar una sola vez.

create table public.casos (
  id               bigint generated always as identity primary key,

  -- Apertura del caso
  numero_pedido    text not null,
  cliente_nombre   text not null,
  cliente_numero   text not null,
  fecha_recibido   date not null,
  recibido_por     text not null,
  producto         text not null,
  numero_serial    text not null,
  falla            text not null,

  -- Se llenan en los pasos siguientes
  fecha_envio      date,
  guia_path        text,
  guia_nombre      text,
  fotos_envio      text[] not null default '{}',
  fecha_devolucion date,

  estado           text not null default 'recibido_tienda',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint casos_apertura_completa check (
    length(trim(numero_pedido)) > 0 and length(trim(cliente_nombre)) > 0
    and length(trim(cliente_numero)) > 0 and length(trim(producto)) > 0
    and length(trim(numero_serial)) > 0 and length(trim(falla)) > 0
  ),
  constraint casos_recibido_por check (length(trim(recibido_por)) > 0),
  -- El envío a fábrica lleva de 1 a 5 fotos de evidencia; sin envío, ninguna.
  constraint casos_envio_con_fotos check (
    case when fecha_envio is null then cardinality(fotos_envio) = 0
         else cardinality(fotos_envio) between 1 and 5 end
  ),
  constraint casos_estado_valido check (estado in (
    'recibido_tienda', 'enviado_fabrica', 'devuelto_tienda', 'entregado_cliente',
    'pedido_reposicion', 'cambio_producto'
  )),
  -- No hay fecha de envío sin el PDF de la guía, ni guía sin fecha.
  constraint casos_envio_con_guia check ((fecha_envio is null) = (guia_path is null)),
  constraint casos_enviado_requiere_guia check (estado <> 'enviado_fabrica' or guia_path is not null),
  constraint casos_devuelto_requiere_fecha check (estado <> 'devuelto_tienda' or fecha_devolucion is not null),
  constraint casos_devolucion_requiere_envio check (fecha_devolucion is null or fecha_envio is not null),
  constraint casos_envio_orden check (fecha_envio is null or fecha_envio >= fecha_recibido),
  constraint casos_devolucion_orden check (fecha_devolucion is null or fecha_devolucion >= fecha_envio)
);

create index casos_estado_idx on public.casos (estado);

-- Tracking: cada cambio de estado queda registrado con fecha y usuario.
create table public.caso_historial (
  id         bigint generated always as identity primary key,
  caso_id    bigint not null references public.casos (id) on delete cascade,
  estado     text not null,
  usuario    text,
  created_at timestamptz not null default now()
);

create index caso_historial_caso_idx on public.caso_historial (caso_id, created_at);

create function public.registrar_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.caso_historial (caso_id, estado, usuario)
  values (new.id, new.estado, auth.jwt() ->> 'email');
  return new;
end;
$$;

create trigger casos_historial_insert
  after insert on public.casos
  for each row execute function public.registrar_estado();

create trigger casos_historial_update
  after update of estado on public.casos
  for each row when (old.estado is distinct from new.estado)
  execute function public.registrar_estado();

create function public.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger casos_updated_at
  before update on public.casos
  for each row execute function public.tocar_updated_at();

-- Acceso: solo usuarios con sesión iniciada.
alter table public.casos enable row level security;
alter table public.caso_historial enable row level security;

revoke all on public.casos, public.caso_historial from anon, authenticated;
grant select, insert, update, delete on public.casos to authenticated;
grant select on public.caso_historial to authenticated;
revoke execute on function public.registrar_estado() from public, anon, authenticated;

create policy casos_leer on public.casos for select to authenticated using (true);
create policy casos_crear on public.casos for insert to authenticated with check (true);
create policy casos_editar on public.casos for update to authenticated using (true) with check (true);
create policy casos_borrar on public.casos for delete to authenticated using (true);
create policy historial_leer on public.caso_historial for select to authenticated using (true);

-- Consulta de la tarea programada que evita la pausa del plan gratis.
-- Toca la base de datos de verdad, pero solo responde 'ok': no expone ningún dato.
create function public.ping() returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.casos limit 1;
  return 'ok';
end;
$$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- PDFs de las guías: bucket privado, solo PDF, máximo 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guias', 'guias', false, 10485760, array['application/pdf']);

create policy guias_leer on storage.objects for select to authenticated
  using (bucket_id = 'guias');
create policy guias_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'guias');
create policy guias_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'guias');

-- Fotos de evidencia del envío: bucket privado. La página las reduce y convierte a JPG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 5242880, array['image/jpeg']);

create policy evidencias_leer on storage.objects for select to authenticated
  using (bucket_id = 'evidencias');
create policy evidencias_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias');
create policy evidencias_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias');
