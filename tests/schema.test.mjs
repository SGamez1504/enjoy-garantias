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

const APERTURA = `numero_pedido, cliente_nombre, cliente_numero, fecha_recibido, recibido_por, producto, numero_serial, falla`;
const VALORES = `'P-1', 'Ana', '3001234567', '2026-11-01', 'Sergio', 'PS5', 'SN1', 'No enciende'`;
const FOTOS = `array['1/a.jpg']`;

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
  assert.equal(caso.recibido_por, 'Sergio');
  assert.deepEqual(caso.fotos_envio, []);
  const { rows } = await db.query('select * from caso_historial where caso_id = $1', [caso.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, 'recibido_tienda');
  assert.equal(rows[0].usuario, 'tienda@enjoy.test');
});

test('no se puede enviar a fábrica sin guía', async () => {
  const { id } = await crearCaso();
  await rechaza(`update casos set estado = 'enviado_fabrica' where id = ${id}`, 'casos_enviado_requiere_guia');
  await rechaza(`update casos set fecha_envio = '2026-11-02', fotos_envio = ${FOTOS} where id = ${id}`, 'casos_envio_con_guia');
});

test('el envío exige de 1 a 5 fotos', async () => {
  const { id } = await crearCaso();
  const envio = `fecha_envio = '2026-11-02', guia_path = 'g.pdf'`;
  await rechaza(`update casos set ${envio} where id = ${id}`, 'casos_envio_con_fotos');
  const seis = `array['1','2','3','4','5','6']`;
  await rechaza(`update casos set ${envio}, fotos_envio = ${seis} where id = ${id}`, 'casos_envio_con_fotos');
  await rechaza(`update casos set fotos_envio = ${FOTOS} where id = ${id}`, 'casos_envio_con_fotos');
  await db.exec(`update casos set ${envio}, fotos_envio = array['1','2','3','4','5'] where id = ${id}`);
});

test('flujo completo de las 4 fases deja historial en orden', async () => {
  const { id } = await crearCaso();
  await db.exec(`update casos set fecha_envio = '2026-11-02', guia_path = '${id}/g.pdf', fotos_envio = ${FOTOS}, estado = 'enviado_fabrica' where id = ${id}`);
  await db.exec(`update casos set fecha_devolucion = '2026-11-10', estado = 'devuelto_tienda' where id = ${id}`);
  await db.exec(`update casos set estado = 'entregado_cliente' where id = ${id}`);
  const { rows } = await db.query('select estado from caso_historial where caso_id = $1 order by id', [id]);
  assert.deepEqual(rows.map((r) => r.estado),
    ['recibido_tienda', 'enviado_fabrica', 'devuelto_tienda', 'entregado_cliente']);
});

test('devuelto a tienda exige fecha, y las fechas deben ir en orden', async () => {
  const { id } = await crearCaso();
  await rechaza(`update casos set estado = 'devuelto_tienda' where id = ${id}`, 'casos_devuelto_requiere_fecha');
  await rechaza(`update casos set fecha_envio = '2026-10-01', guia_path = 'x.pdf', fotos_envio = ${FOTOS} where id = ${id}`, 'casos_envio_orden');
  await db.exec(`update casos set fecha_envio = '2026-11-05', guia_path = 'x.pdf', fotos_envio = ${FOTOS} where id = ${id}`);
  await rechaza(`update casos set fecha_devolucion = '2026-11-04' where id = ${id}`, 'casos_devolucion_orden');
});

test('los estados excepcionales no requieren guía; un estado inventado se rechaza', async () => {
  const { id } = await crearCaso();
  await db.exec(`update casos set estado = 'pedido_reposicion' where id = ${id}`);
  await db.exec(`update casos set estado = 'cambio_producto', nuevo_producto = 'PS5 Pro', nuevo_numero_serial = 'SN2', cambio_erp_confirmado = true where id = ${id}`);
  await rechaza(`update casos set estado = 'perdido' where id = ${id}`, 'casos_estado_valido');
});

test('el cambio de producto exige producto, serial y confirmación del ERP', async () => {
  const { id } = await crearCaso();
  const r = 'casos_cambio_completo';
  await rechaza(`update casos set estado = 'cambio_producto' where id = ${id}`, r);
  await rechaza(`update casos set estado = 'cambio_producto', nuevo_producto = 'X', nuevo_numero_serial = 'S' where id = ${id}`, r);
  await rechaza(`update casos set estado = 'cambio_producto', nuevo_producto = ' ', nuevo_numero_serial = 'S', cambio_erp_confirmado = true where id = ${id}`, r);
  await rechaza(`update casos set estado = 'cambio_producto', nuevo_producto = 'X', cambio_erp_confirmado = true where id = ${id}`, r);
  await db.exec(`update casos set estado = 'cambio_producto', nuevo_producto = 'X', nuevo_numero_serial = 'S', cambio_erp_confirmado = true where id = ${id}`);
  // Después de entregar, los datos del cambio se conservan.
  await db.exec(`update casos set estado = 'entregado_cliente' where id = ${id}`);
  const { rows } = await db.query('select nuevo_producto from casos where id = $1', [id]);
  assert.equal(rows[0].nuevo_producto, 'X');
});

test('el número de caso es G-EVG-pedido, único y no se puede fijar a mano', async () => {
  const crear = async (pedido, extra = '') => (await db.query(
    `insert into casos (${APERTURA}${extra ? ', numero_caso' : ''}) values ('${pedido}', 'Ana', '1', '2026-11-01', 'Sergio', 'PS5', 'S', 'F'${extra}) returning id, numero_caso`,
  )).rows[0];

  const a = await crear('94035');
  assert.equal(a.numero_caso, 'G-EVG-94035');
  assert.equal((await crear('94035')).numero_caso, 'G-EVG-94035-2');
  assert.equal((await crear('94035')).numero_caso, 'G-EVG-94035-3');
  assert.equal((await crear('#555')).numero_caso, 'G-EVG-555');
  assert.equal((await crear('777', ", 'INVENTADO'")).numero_caso, 'G-EVG-777');

  const editar = async (sql) => (await db.query(`update casos set ${sql} where id = ${a.id} returning numero_caso`)).rows[0].numero_caso;
  assert.equal(await editar(`falla = 'Otra'`), 'G-EVG-94035');
  assert.equal(await editar(`numero_caso = 'INVENTADO'`), 'G-EVG-94035');
  assert.equal(await editar(`numero_pedido = '88888'`), 'G-EVG-88888');
  // Guardar el mismo pedido no le agrega sufijo a su propio número.
  assert.equal(await editar(`numero_pedido = '88888'`), 'G-EVG-88888');
});

test('editar datos sin cambiar estado no ensucia el historial', async () => {
  const { id } = await crearCaso();
  await db.exec(`update casos set falla = 'Sobrecalienta' where id = ${id}`);
  const { rows } = await db.query('select count(*)::int as n from caso_historial where caso_id = $1', [id]);
  assert.equal(rows[0].n, 1);
});

test('campos de apertura vacíos se rechazan', async () => {
  await rechaza(`insert into casos (${APERTURA}) values ('  ', 'Ana', '1', '2026-11-01', 'Sergio', 'PS5', 'S', 'F')`, 'casos_apertura_completa');
  await rechaza(`insert into casos (${APERTURA}) values ('P', 'Ana', '1', '2026-11-01', '  ', 'PS5', 'S', 'F')`, 'casos_recibido_por');
});

test('permisos: anon no ve nada ni borra; authenticated crea, edita y borra', async () => {
  const { id } = await crearCaso();
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from casos'), /permission denied/);
  await assert.rejects(db.query('select * from caso_historial'), /permission denied/);
  await assert.rejects(db.query(`delete from casos where id = ${id}`), /permission denied/);
  await db.exec('reset role; set role authenticated');
  try {
    const nuevo = await crearCaso(); // inserta también en historial vía trigger
    await db.exec(`update casos set falla = 'Otra' where id = ${nuevo.id}`);
    const { rows } = await db.query('select id from casos where id = $1', [id]);
    assert.equal(rows.length, 1);
    await assert.rejects(db.query(`insert into caso_historial (caso_id, estado) values (${id}, 'x')`), /permission denied/);
    await assert.rejects(db.query(`delete from caso_historial where caso_id = ${id}`), /permission denied/);
  } finally {
    await db.exec('reset role');
  }
});

test('eliminar un caso se lleva su historial', async () => {
  const { id } = await crearCaso();
  await db.exec('set role authenticated');
  try {
    const { rows } = await db.query(`delete from casos where id = ${id} returning id`);
    assert.equal(rows.length, 1);
    const hist = await db.query('select count(*)::int as n from caso_historial where caso_id = $1', [id]);
    assert.equal(hist.rows[0].n, 0);
  } finally {
    await db.exec('reset role');
  }
});

test('ping responde ok sin sesión y sigue sin dar acceso a los casos', async () => {
  await crearCaso();
  await db.exec('set role anon');
  try {
    const { rows } = await db.query('select public.ping() as r');
    assert.equal(rows[0].r, 'ok');
    await assert.rejects(db.query('select * from casos'), /permission denied/);
  } finally {
    await db.exec('reset role');
  }
});

test('los buckets son privados y limitados por tipo de archivo', async () => {
  const { rows } = await db.query(`select * from storage.buckets order by id`);
  assert.deepEqual(rows.map((b) => [b.id, b.public, b.allowed_mime_types]), [
    ['evidencias', false, ['image/jpeg']],
    ['guias', false, ['application/pdf']],
  ]);
});
