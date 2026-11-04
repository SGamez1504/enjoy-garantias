'use strict';

const FASES = ['recibido_tienda', 'enviado_fabrica', 'devuelto_tienda', 'entregado_cliente'];
const EXCEPCIONES = ['pedido_reposicion', 'cambio_producto'];
const ESTADOS = {
  recibido_tienda: 'Recibido en tienda',
  enviado_fabrica: 'Enviado a fábrica',
  devuelto_tienda: 'Devuelto a tienda',
  entregado_cliente: 'Entregado al cliente',
  pedido_reposicion: 'Pedido producto reposición',
  cambio_producto: 'Cambio de producto',
};
const MAX_PDF = 10 * 1024 * 1024;
const POR_PAGINA = 1000;

const MENSAJES = [
  ['casos_envio_con_guia', 'La fecha de envío y la guía van juntas: registra ambas.'],
  ['casos_enviado_requiere_guia', 'Para pasar a "Enviado a fábrica" el caso necesita fecha de envío y guía.'],
  ['casos_devuelto_requiere_fecha', 'Para pasar a "Devuelto a tienda" falta la fecha de recibido de fábrica.'],
  ['casos_devolucion_requiere_envio', 'No puede haber recibido de fábrica sin fecha de envío.'],
  ['casos_envio_orden', 'La fecha de envío no puede ser anterior a la fecha de recibido.'],
  ['casos_devolucion_orden', 'El recibido de fábrica no puede ser anterior a la fecha de envío.'],
  ['casos_apertura_completa', 'Todos los datos de apertura son obligatorios.'],
  ['Invalid login credentials', 'Correo o contraseña incorrectos.'],
  ['Failed to fetch', 'No hay conexión con la base de datos. Intenta de nuevo.'],
  ['JWT expired', 'La sesión expiró. Vuelve a entrar.'],
];

const $ = (sel) => document.querySelector(sel);
const sb = configurado() && supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

let casos = [];
let filtroEstado = 'todos';

function configurado() {
  return !CONFIG.supabaseUrl.includes('TU-PROYECTO');
}

// ---------- Utilidades ----------

function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...hijos.filter((x) => x !== null && x !== undefined));
  return el;
}

function hoy() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

// Las fechas son 'AAAA-MM-DD'; se parten a mano para no correrlas un día por zona horaria.
function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function fechaHora(ts) {
  return new Date(ts).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
}

function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Errores de validación propios: su mensaje ya está escrito para quien usa la página.
class ErrorUsuario extends Error {}

function traducir(err) {
  if (err instanceof ErrorUsuario) return err.message;
  const msg = err?.message ?? String(err);
  const conocido = MENSAJES.find(([clave]) => msg.includes(clave));
  return conocido ? conocido[1] : `No se pudo completar: ${msg}`;
}

let avisoTimer;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

function mostrarError(dlg, err) {
  const el = dlg.querySelector('.error');
  el.textContent = err ? traducir(err) : '';
  el.hidden = !err;
}

async function validarPdf(file) {
  if (file.size > MAX_PDF) throw new ErrorUsuario('La guía pesa más de 10 MB.');
  const cabecera = await file.slice(0, 5).text();
  if (cabecera !== '%PDF-') throw new ErrorUsuario('El archivo de la guía no es un PDF válido.');
}

async function subirGuia(casoId, file) {
  await validarPdf(file);
  const path = `${casoId}/${crypto.randomUUID()}.pdf`;
  const { error } = await sb.storage.from('guias').upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  return { guia_path: path, guia_nombre: file.name };
}

async function abrirGuia(caso) {
  // La pestaña se abre antes de la espera; si no, el navegador la bloquea como popup.
  const pestana = window.open('', '_blank');
  const { data, error } = await sb.storage.from('guias').createSignedUrl(caso.guia_path, 300);
  if (error) {
    pestana?.close();
    aviso(traducir(error));
    return;
  }
  if (pestana) pestana.location = data.signedUrl;
}

async function actualizar(id, cambios) {
  const { error } = await sb.from('casos').update(cambios).eq('id', id);
  if (error) throw error;
  await cargar();
}

// Ejecuta un envío de formulario desactivando el botón y mostrando errores en el diálogo.
function alEnviar(form, fn) {
  const dlg = form.closest('dialog');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    mostrarError(dlg, null);
    try {
      await fn(new FormData(form));
      dlg.close();
    } catch (err) {
      mostrarError(dlg, err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Datos ----------

async function cargar() {
  const filas = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await sb.from('casos').select('*')
      .order('id', { ascending: false }).range(desde, desde + POR_PAGINA - 1);
    if (error) {
      aviso(traducir(error));
      return;
    }
    filas.push(...data);
    if (data.length < POR_PAGINA) break;
  }
  casos = filas;
  pintar();
}

// ---------- Tabla ----------

function pintar() {
  pintarChips();
  const q = normalizar($('#buscar').value).trim();
  const visibles = casos.filter((c) => {
    if (filtroEstado !== 'todos' && c.estado !== filtroEstado) return false;
    if (!q) return true;
    return normalizar([c.id, c.numero_pedido, c.cliente_nombre, c.cliente_numero, c.producto, c.numero_serial, c.falla].join(' ')).includes(q);
  });

  $('#filas').replaceChildren(...visibles.map(fila));
  const vacio = $('#vacio');
  vacio.hidden = visibles.length > 0;
  vacio.textContent = casos.length ? 'Ningún caso coincide con el filtro.' : 'Aún no hay casos. Abre el primero con "+ Nuevo caso".';
}

function pintarChips() {
  const chip = (clave, texto, n) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(filtroEstado === clave),
    onclick: () => { filtroEstado = clave; pintar(); },
  }, texto, h('b', {}, String(n)));

  const contar = (e) => casos.filter((c) => c.estado === e).length;
  $('#chips').replaceChildren(
    chip('todos', 'Todos', casos.length),
    ...Object.keys(ESTADOS).map((e) => chip(e, ESTADOS[e], contar(e))),
  );
}

function badge(estado) {
  return h('span', { class: `badge e-${estado}` }, ESTADOS[estado] ?? estado);
}

function tracking(estado) {
  const i = FASES.indexOf(estado);
  const wrap = h('div', { class: `e-${estado}`, style: 'background:none' }, badge(estado));
  if (i >= 0) {
    wrap.append(h('div', { class: 'fases', 'aria-hidden': 'true' },
      ...FASES.map((_, n) => h('i', { class: n <= i ? 'hecha' : null }))));
  }
  return wrap;
}

function siguientePaso(c) {
  if (c.estado === 'devuelto_tienda' || EXCEPCIONES.includes(c.estado)) {
    return h('button', { class: 'celda-btn', type: 'button', onclick: () => entregar(c) }, 'Entregar');
  }
  return null;
}

function fila(c) {
  const envio = c.fecha_envio
    ? fecha(c.fecha_envio)
    : c.estado === 'recibido_tienda'
      ? h('button', { class: 'celda-btn', type: 'button', onclick: () => abrirEnvio(c) }, 'Registrar envío')
      : null;

  const devolucion = c.fecha_devolucion
    ? fecha(c.fecha_devolucion)
    : c.estado === 'enviado_fabrica'
      ? h('button', { class: 'celda-btn', type: 'button', onclick: () => abrirDevolucion(c) }, 'Registrar recibido')
      : null;

  const guia = c.guia_path
    ? h('button', { class: 'enlace', type: 'button', title: c.guia_nombre, onclick: () => abrirGuia(c) }, 'Ver PDF')
    : null;

  return h('tr', {},
    h('td', { class: 'id' }, h('button', {
      class: 'enlace', type: 'button', title: 'Ver detalle', onclick: () => abrirDetalle(c),
    }, `#${c.id}`)),
    h('td', {}, c.numero_pedido),
    h('td', {}, c.cliente_nombre),
    h('td', {}, c.cliente_numero),
    h('td', { class: 'fecha' }, fecha(c.fecha_recibido)),
    h('td', {}, c.producto),
    h('td', {}, c.numero_serial),
    h('td', { class: 'falla', title: c.falla }, c.falla),
    h('td', { class: 'fecha' }, envio),
    h('td', {}, guia),
    h('td', { class: 'fecha' }, devolucion),
    h('td', { class: 'fija' }, h('div', { class: 'estado-celda' }, tracking(c.estado), siguientePaso(c))),
  );
}

// ---------- Pasos del caso ----------

function abrirEnvio(c) {
  const dlg = $('#dlg-envio');
  const form = $('#form-envio');
  form.reset();
  mostrarError(dlg, null);
  form.dataset.id = c.id;
  dlg.querySelector('.dlg-sub').textContent = `Caso #${c.id} · ${c.producto} · ${c.cliente_nombre}`;
  form.fecha_envio.value = hoy();
  form.fecha_envio.min = c.fecha_recibido;
  dlg.showModal();
}

function abrirDevolucion(c) {
  const dlg = $('#dlg-devolucion');
  const form = $('#form-devolucion');
  form.reset();
  mostrarError(dlg, null);
  form.dataset.id = c.id;
  dlg.querySelector('.dlg-sub').textContent = `Caso #${c.id} · ${c.producto} · ${c.cliente_nombre}`;
  form.fecha_devolucion.value = hoy();
  form.fecha_devolucion.min = c.fecha_envio;
  dlg.showModal();
}

async function entregar(c) {
  if (!confirm(`¿Marcar el caso #${c.id} como entregado al cliente?`)) return;
  try {
    await actualizar(c.id, { estado: 'entregado_cliente' });
    aviso(`Caso #${c.id} entregado al cliente.`);
  } catch (err) {
    aviso(traducir(err));
  }
}

function abrirNuevo() {
  const form = $('#form-caso');
  const dlg = $('#dlg-caso');
  form.reset();
  mostrarError(dlg, null);
  delete form.dataset.id;
  $('#dlg-caso-titulo').textContent = 'Nuevo caso';
  $('#campos-edicion').hidden = true;
  form.fecha_recibido.value = hoy();
  dlg.showModal();
}

function abrirEdicion(c) {
  const form = $('#form-caso');
  const dlg = $('#dlg-caso');
  form.reset();
  mostrarError(dlg, null);
  form.dataset.id = c.id;
  $('#dlg-caso-titulo').textContent = `Editar caso #${c.id}`;
  $('#campos-edicion').hidden = false;
  for (const campo of ['numero_pedido', 'fecha_recibido', 'cliente_nombre', 'cliente_numero', 'producto',
    'numero_serial', 'falla', 'estado', 'fecha_envio', 'fecha_devolucion']) {
    form[campo].value = c[campo] ?? '';
  }
  dlg.showModal();
}

async function guardarCaso(datos) {
  const form = $('#form-caso');
  const apertura = {};
  for (const campo of ['numero_pedido', 'cliente_nombre', 'cliente_numero', 'producto', 'numero_serial', 'falla']) {
    apertura[campo] = datos.get(campo).trim();
  }
  apertura.fecha_recibido = datos.get('fecha_recibido');

  if (!form.dataset.id) {
    const { error } = await sb.from('casos').insert(apertura);
    if (error) throw error;
    await cargar();
    aviso('Caso abierto.');
    return;
  }

  const id = Number(form.dataset.id);
  const actual = casos.find((c) => c.id === id);
  const cambios = {
    ...apertura,
    estado: datos.get('estado'),
    fecha_envio: datos.get('fecha_envio') || null,
    fecha_devolucion: datos.get('fecha_devolucion') || null,
  };
  const pdf = datos.get('guia');
  if (pdf?.size) {
    Object.assign(cambios, await subirGuia(id, pdf));
  } else if (!cambios.fecha_envio) {
    cambios.guia_path = null;
    cambios.guia_nombre = null;
  } else if (!actual?.guia_path) {
    throw new ErrorUsuario('Para registrar la fecha de envío también debes adjuntar la guía en PDF.');
  }
  await actualizar(id, cambios);
  aviso(`Caso #${id} actualizado.`);
}

// ---------- Detalle ----------

async function abrirDetalle(c) {
  const dlg = $('#dlg-detalle');
  mostrarError(dlg, null);
  $('#det-titulo').textContent = `Caso #${c.id}`;

  const filas = [
    ['Pedido', c.numero_pedido],
    ['Cliente', c.cliente_nombre],
    ['Número cliente', c.cliente_numero],
    ['Producto', c.producto],
    ['Serial', c.numero_serial],
    ['Falla', c.falla],
    ['Recibido', fecha(c.fecha_recibido)],
    ['Fecha envío', fecha(c.fecha_envio) || '—'],
    ['Guía', c.guia_path ? h('button', { class: 'enlace', type: 'button', onclick: () => abrirGuia(c) }, c.guia_nombre || 'Ver PDF') : '—'],
    ['Recibido de fábrica', fecha(c.fecha_devolucion) || '—'],
    ['Estado', badge(c.estado)],
  ];
  $('#det-datos').replaceChildren(...filas.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

  const acciones = [];
  if (c.estado !== 'entregado_cliente') {
    for (const e of EXCEPCIONES) {
      if (e !== c.estado) {
        acciones.push(h('button', { class: 'sutil', type: 'button', onclick: () => marcarExcepcion(c, e) }, ESTADOS[e]));
      }
    }
  }
  acciones.push(
    h('button', { class: 'sutil', type: 'button', onclick: () => { dlg.close(); abrirEdicion(c); } }, 'Editar'),
    h('button', { class: 'primario', type: 'button', onclick: () => dlg.close() }, 'Cerrar'),
  );
  $('#det-acciones').replaceChildren(...acciones);

  const lista = $('#det-historial');
  lista.replaceChildren(h('li', {}, h('small', {}, 'Cargando…')));
  dlg.showModal();

  const { data, error } = await sb.from('caso_historial').select('*').eq('caso_id', c.id).order('id');
  if (error) {
    lista.replaceChildren();
    mostrarError(dlg, error);
    return;
  }
  lista.replaceChildren(...data.map((r) => h('li', {},
    badge(r.estado),
    h('small', {}, [fechaHora(r.created_at), r.usuario].filter(Boolean).join(' · ')))));
}

async function marcarExcepcion(c, estado) {
  const dlg = $('#dlg-detalle');
  if (!confirm(`¿Cambiar el caso #${c.id} a "${ESTADOS[estado]}"?`)) return;
  try {
    await actualizar(c.id, { estado });
    dlg.close();
    aviso(`Caso #${c.id}: ${ESTADOS[estado]}.`);
  } catch (err) {
    mostrarError(dlg, err);
  }
}

// ---------- Sesión y arranque ----------

function mostrarVista(id) {
  for (const v of ['vista-config', 'vista-login', 'vista-app']) $(`#${v}`).hidden = v !== id;
}

function iniciar() {
  if (!sb) {
    mostrarVista('vista-config');
    return;
  }

  $('#form-caso').estado.append(...Object.entries(ESTADOS).map(([v, t]) => h('option', { value: v }, t)));

  $('#form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const errorEl = $('#login-error');
    errorEl.hidden = true;
    const { error } = await sb.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.password.value,
    });
    if (error) {
      errorEl.textContent = traducir(error);
      errorEl.hidden = false;
    } else {
      form.reset();
    }
  });

  alEnviar($('#form-caso'), guardarCaso);

  alEnviar($('#form-envio'), async (datos) => {
    const id = Number($('#form-envio').dataset.id);
    const guia = await subirGuia(id, datos.get('guia'));
    await actualizar(id, { fecha_envio: datos.get('fecha_envio'), ...guia, estado: 'enviado_fabrica' });
    aviso(`Caso #${id} enviado a fábrica.`);
  });

  alEnviar($('#form-devolucion'), async (datos) => {
    const id = Number($('#form-devolucion').dataset.id);
    await actualizar(id, { fecha_devolucion: datos.get('fecha_devolucion'), estado: 'devuelto_tienda' });
    aviso(`Caso #${id} devuelto a tienda.`);
  });

  document.querySelectorAll('[data-cerrar]').forEach((b) =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  $('#btn-nuevo').addEventListener('click', abrirNuevo);
  $('#btn-salir').addEventListener('click', () => sb.auth.signOut());
  $('#buscar').addEventListener('input', pintar);

  sb.auth.onAuthStateChange((_evento, sesion) => {
    mostrarVista(sesion ? 'vista-app' : 'vista-login');
    // Fuera del callback: supabase-js se traba si se le consulta desde aquí mismo.
    if (sesion) setTimeout(cargar, 0);
  });
}

iniciar();
