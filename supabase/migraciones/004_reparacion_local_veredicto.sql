-- Ejecutar una sola vez, después de 003.
-- Agrega: estado "Reparación local" y el veredicto que se pide al registrar el regreso a tienda.

alter table public.casos add column reparacion_lugar text;
alter table public.casos add column reparacion_mensajeria boolean not null default false;
alter table public.casos add column reparacion_guia_path text;
alter table public.casos add column reparacion_guia_nombre text;
alter table public.casos add column reparacion_fecha_envio date;
alter table public.casos add column veredicto_reparado boolean;
alter table public.casos add column veredicto_dano text;
alter table public.casos add column veredicto_funcionamiento text;

alter table public.casos drop constraint casos_estado_valido;
alter table public.casos add constraint casos_estado_valido check (estado in (
  'recibido_tienda', 'enviado_fabrica', 'devuelto_tienda', 'entregado_cliente',
  'pedido_reposicion', 'cambio_producto', 'reparacion_local'
));

-- El regreso a tienda puede venir de la fábrica o de una reparación local.
alter table public.casos drop constraint casos_devolucion_requiere_envio;
alter table public.casos add constraint casos_devolucion_requiere_envio check (
  fecha_devolucion is null or fecha_envio is not null or reparacion_fecha_envio is not null
);

alter table public.casos add constraint casos_reparacion_completa check (
  estado <> 'reparacion_local' or (
    length(trim(coalesce(reparacion_lugar, ''))) > 0
    and reparacion_fecha_envio is not null
    and (not reparacion_mensajeria or reparacion_guia_path is not null)
  )
);
alter table public.casos add constraint casos_reparacion_guia check (
  reparacion_guia_path is null or reparacion_mensajeria
);
alter table public.casos add constraint casos_reparacion_orden check (
  reparacion_fecha_envio is null or reparacion_fecha_envio >= fecha_recibido
);
alter table public.casos add constraint casos_devolucion_orden_reparacion check (
  fecha_devolucion is null or reparacion_fecha_envio is null or fecha_devolucion >= reparacion_fecha_envio
);

alter table public.casos add constraint casos_funcionamiento_valido check (
  veredicto_funcionamiento is null or veredicto_funcionamiento in ('total', 'parcial', 'no_funciona')
);
-- NOT VALID: los casos que ya regresaron antes de este cambio no tienen veredicto.
alter table public.casos add constraint casos_veredicto_completo check (
  fecha_devolucion is null or (
    veredicto_reparado is not null
    and length(trim(coalesce(veredicto_dano, ''))) > 0
    and veredicto_funcionamiento is not null
  )
) not valid;
