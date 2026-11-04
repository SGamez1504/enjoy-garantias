-- Ejecutar una sola vez, después de 002.
-- Agrega: número de caso G-EVG-<pedido> y los datos del cambio de producto.

alter table public.casos add column numero_caso text;

-- Casos existentes: el segundo caso de un mismo pedido queda como G-EVG-<pedido>-2.
with numerados as (
  select id,
         'G-EVG-' || regexp_replace(trim(numero_pedido), '^#+\s*', '') as base,
         row_number() over (partition by regexp_replace(trim(numero_pedido), '^#+\s*', '') order by id) as n
  from public.casos
)
update public.casos c
set numero_caso = case when v.n = 1 then v.base else v.base || '-' || v.n end
from numerados v
where v.id = c.id;

alter table public.casos alter column numero_caso set not null;
alter table public.casos add constraint casos_numero_caso_unico unique (numero_caso);

create function public.asignar_numero_caso() returns trigger
language plpgsql set search_path = '' as $$
declare
  base text;
  candidato text;
  n int := 1;
begin
  -- El número solo cambia si cambia el pedido; no se puede fijar a mano.
  if tg_op = 'UPDATE' and new.numero_pedido is not distinct from old.numero_pedido then
    new.numero_caso := old.numero_caso;
    return new;
  end if;

  base := 'G-EVG-' || regexp_replace(trim(new.numero_pedido), '^#+\s*', '');
  candidato := base;
  while exists (select 1 from public.casos where numero_caso = candidato and id is distinct from new.id) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;
  new.numero_caso := candidato;
  return new;
end;
$$;

create trigger casos_numero_caso
  before insert or update on public.casos
  for each row execute function public.asignar_numero_caso();

alter table public.casos add column nuevo_producto text;
alter table public.casos add column nuevo_numero_serial text;
alter table public.casos add column cambio_erp_confirmado boolean not null default false;
alter table public.casos add constraint casos_cambio_completo check (
  estado <> 'cambio_producto' or (
    length(trim(coalesce(nuevo_producto, ''))) > 0
    and length(trim(coalesce(nuevo_numero_serial, ''))) > 0
    and cambio_erp_confirmado
  )
) not valid;
