// Corre supabase/schema.sql en un Postgres embebido (PGlite) con stubs mínimos
// de los esquemas `auth` y `storage` que Supabase trae de fábrica.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const db = new PGlite();

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select '{"email":"tienda@enjoy.test"}'::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id serial primary key, bucket_id text);
  alter table storage.objects enable row level security;
`;

const APERTURA = `numero_pedido, cliente_nombre, cliente_numero, fecha_recibido, producto, numero_serial, falla`;
const VALORES = `'P-1', 'Ana', '3001234567', '2026-11-01', 'PS5', 'SN1', 'No enciende'`;

async function crearCaso() {
  const { rows } = await db.query(`insert into casos (${APERTURA}) values (${VALORES}) returning *`);
  return rows[0];
}
const rechaza = (sql, constraint) =>
  assert.rejects(db.exec(sql), (e) => e.message.includes(constraint), `debía fallar: ${constraint}`);

before(async () => {
  await db.exec(STUBS);
  await db.exec(schema);
});

test('un caso nuevo arranca en "recibido en tienda" con el historial lleno', async () => {
  const caso = await crearCaso();
  assert.equal(caso.estado, 'recibido_tienda');
  assert.equal(caso.fecha_envio, null);
  const { rows } = await db.query('select * from caso_historial where caso_id = $1', [caso.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, 'recibido_tienda');
  assert.equal(rows[0].usuario, 'tienda@enjoy.test');
});

test('no se puede enviar a fábrica sin guía', async () => {
  const { id } = await crearCaso();
  await rechaza(`update casos set estado = 'enviado_fabrica' where id = ${id}`, 'casos_enviado_requiere_guia');
  await rechaza(`update casos set fecha_envio = '2026-11-02' where id = ${id}`, 'casos_envio_con_guia');
});

test('flujo completo de las 4 fases deja historial en orden', async () => {
  const { id } = await crearCaso();
  await db.exec(`update casos set fecha_envio = '2026-11-02', guia_path = '${id}/g.pdf', estado = 'enviado_fabrica' where id = ${id}`);
  await db.exec(`update casos set fecha_devolucion = '2026-11-10', estado = 'devuelto_tienda' where id = ${id}`);
  await db.exec(`update casos set estado = 'entregado_cliente' where id = ${id}`);
  const { rows } = await db.query('select estado from caso_historial where caso_id = $1 order by id', [id]);
  assert.deepEqual(rows.map((r) => r.estado),
    ['recibido_tienda', 'enviado_fabrica', 'devuelto_tienda', 'entregado_cliente']);
});

test('devuelto a tienda exige fecha, y las fechas deben ir en orden', async () => {
  const { id } = await crearCaso();
  await rechaza(`update casos set estado = 'devuelto_tienda' where id = ${id}`, 'casos_devuelto_requiere_fecha');
  await rechaza(`update casos set fecha_envio = '2026-10-01', guia_path = 'x.pdf' where id = ${id}`, 'casos_envio_orden');
  await db.exec(`update casos set fecha_envio = '2026-11-05', guia_path = 'x.pdf' where id = ${id}`);
  await rechaza(`update casos set fecha_devolucion = '2026-11-04' where id = ${id}`, 'casos_devolucion_orden');
});

test('los estados excepcionales no requieren guía; un estado inventado se rechaza', async () => {
  const { id } = await crearCaso();
  await db.exec(`update casos set estado = 'pedido_reposicion' where id = ${id}`);
  await db.exec(`update casos set estado = 'cambio_producto' where id = ${id}`);
  await rechaza(`update casos set estado = 'perdido' where id = ${id}`, 'casos_estado_valido');
});

test('editar datos sin cambiar estado no ensucia el historial', async () => {
  const { id } = await crearCaso();
  await db.exec(`update casos set falla = 'Sobrecalienta' where id = ${id}`);
  const { rows } = await db.query('select count(*)::int as n from caso_historial where caso_id = $1', [id]);
  assert.equal(rows[0].n, 1);
});

test('campos de apertura vacíos se rechazan', () =>
  rechaza(`insert into casos (${APERTURA}) values ('  ', 'Ana', '1', '2026-11-01', 'PS5', 'S', 'F')`, 'casos_apertura_completa'));

test('permisos: anon no ve nada; authenticated crea y edita pero no borra', async () => {
  const { id } = await crearCaso();
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from casos'), /permission denied/);
  await assert.rejects(db.query('select * from caso_historial'), /permission denied/);
  await db.exec('reset role; set role authenticated');
  try {
    const nuevo = await crearCaso(); // inserta también en historial vía trigger
    await db.exec(`update casos set falla = 'Otra' where id = ${nuevo.id}`);
    const { rows } = await db.query('select id from casos where id = $1', [id]);
    assert.equal(rows.length, 1);
    await assert.rejects(db.query(`delete from casos where id = ${id}`), /permission denied/);
    await assert.rejects(db.query(`insert into caso_historial (caso_id, estado) values (${id}, 'x')`), /permission denied/);
  } finally {
    await db.exec('reset role');
  }
});

test('el bucket de guías es privado y solo acepta PDF', async () => {
  const { rows } = await db.query(`select * from storage.buckets where id = 'guias'`);
  assert.equal(rows[0].public, false);
  assert.deepEqual(rows[0].allowed_mime_types, ['application/pdf']);
});
