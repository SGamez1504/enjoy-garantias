// Doble en memoria de supabase-js, solo para `npm run demo`. Nunca se publica en uso real:
// tests/demo-server.mjs lo sirve en lugar de vendor/supabase.js. Replica las mismas
// reglas de supabase/schema.sql para poder probar la página sin un proyecto real.
(() => {
  const ahora = () => new Date().toISOString();
  const db = { casos: [], caso_historial: [] };
  const archivos = { guias: new Map(), evidencias: new Map() };
  let nextId = 1;
  let nextHist = 1;

  function revisar(c) {
    if (!['recibido_tienda', 'enviado_fabrica', 'devuelto_tienda', 'entregado_cliente', 'pedido_reposicion', 'cambio_producto'].includes(c.estado)) return 'casos_estado_valido';
    if (!c.recibido_por?.trim()) return 'casos_recibido_por';
    if (c.estado === 'cambio_producto' && !(c.nuevo_producto?.trim() && c.nuevo_numero_serial?.trim() && c.cambio_erp_confirmado)) return 'casos_cambio_completo';
    const nFotos = c.fotos_envio.length;
    if (c.fecha_envio ? nFotos < 1 || nFotos > 5 : nFotos !== 0) return 'casos_envio_con_fotos';
    if (!c.fecha_envio !== !c.guia_path) return 'casos_envio_con_guia';
    if (c.estado === 'enviado_fabrica' && !c.guia_path) return 'casos_enviado_requiere_guia';
    if (c.estado === 'devuelto_tienda' && !c.fecha_devolucion) return 'casos_devuelto_requiere_fecha';
    if (c.fecha_devolucion && !c.fecha_envio) return 'casos_devolucion_requiere_envio';
    if (c.fecha_envio && c.fecha_envio < c.fecha_recibido) return 'casos_envio_orden';
    if (c.fecha_devolucion && c.fecha_devolucion < c.fecha_envio) return 'casos_devolucion_orden';
    return null;
  }
  const historial = (caso_id, estado) => db.caso_historial.push({
    id: nextHist++, caso_id, estado, usuario: 'demo@enjoy.test', created_at: ahora(),
  });
  const violacion = (r) => ({ data: null, error: { message: `new row violates check constraint "${r}"` } });

  function numeroCaso(pedido, id) {
    const base = `G-EVG-${pedido.trim().replace(/^#+\s*/, '')}`;
    let candidato = base;
    for (let n = 2; db.casos.some((c) => c.numero_caso === candidato && c.id !== id); n += 1) candidato = `${base}-${n}`;
    return candidato;
  }

  function crear(o) {
    const id = nextId++;
    const c = {
      id, numero_caso: numeroCaso(o.numero_pedido, id), nuevo_producto: null, nuevo_numero_serial: null, cambio_erp_confirmado: false, fecha_envio: null, guia_path: null, guia_nombre: null, fotos_envio: [], fecha_devolucion: null,
      estado: 'recibido_tienda', created_at: ahora(), updated_at: ahora(), ...o,
    };
    const r = revisar(c);
    if (r) return violacion(r);
    db.casos.push(c);
    historial(c.id, c.estado);
    return { data: { ...c }, error: null };
  }

  function consulta(tabla) {
    const q = { filtros: [], orden: null, rango: null, cambios: null, borrar: false, creado: null, unico: false };
    const api = {
      select: () => api,
      single: () => { q.unico = true; return api; },
      eq: (k, v) => { q.filtros.push([k, v]); return api; },
      order: (k, o = {}) => { q.orden = [k, o.ascending !== false]; return api; },
      range: (a, b) => { q.rango = [a, b]; return api; },
      insert: (o) => { q.creado = o; return api; },
      update: (o) => { q.cambios = o; return api; },
      delete: () => { q.borrar = true; return api; },
      then: (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko),
    };
    function ejecutar() {
      if (q.creado) return crear(q.creado);
      let filas = db[tabla].filter((f) => q.filtros.every(([k, v]) => f[k] === v));
      if (q.borrar) {
        db[tabla] = db[tabla].filter((f) => !filas.includes(f));
        for (const f of filas) db.caso_historial = db.caso_historial.filter((h) => h.caso_id !== f.id);
        return { data: filas.map((f) => ({ id: f.id })), error: null };
      }
      if (q.cambios) {
        for (const f of filas) {
          const nuevo = { ...f, ...q.cambios };
          if (nuevo.numero_pedido !== f.numero_pedido) nuevo.numero_caso = numeroCaso(nuevo.numero_pedido, f.id);
          const r = revisar(nuevo);
          if (r) return violacion(r);
          if (nuevo.estado !== f.estado) historial(f.id, nuevo.estado);
          Object.assign(f, nuevo);
        }
        return { data: null, error: null };
      }
      if (q.orden) {
        const [k, asc] = q.orden;
        filas = [...filas].sort((a, b) => (a[k] > b[k] ? 1 : -1) * (asc ? 1 : -1));
      }
      if (q.rango) filas = filas.slice(q.rango[0], q.rango[1] + 1);
      return { data: filas.map((f) => ({ ...f })), error: null };
    }
    return api;
  }

  const foto = (color) => new Blob(
    [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="${color}"/></svg>`],
    { type: 'image/svg+xml' },
  );

  crear({ numero_pedido: 'EV-10231', cliente_nombre: 'Laura Méndez', cliente_numero: '300 555 0142', fecha_recibido: '2026-10-28', recibido_por: 'Asesor Demo', producto: 'Control DualSense', numero_serial: 'DS5-88213', falla: 'Drift en el stick izquierdo' });
  crear({ numero_pedido: 'EV-10198', cliente_nombre: 'Andrés Rojas', cliente_numero: '310 555 0187', fecha_recibido: '2026-10-20', recibido_por: 'Asesor Demo', producto: 'Nintendo Switch OLED', numero_serial: 'XTW70012345', falla: 'No carga por el puerto USB-C, se apaga al conectar el dock y la pantalla parpadea cuando se juega en modo portátil', fecha_envio: '2026-10-22', guia_path: '2/guia.pdf', guia_nombre: 'guia-demo.pdf', fotos_envio: ['2/a.jpg', '2/b.jpg'], estado: 'enviado_fabrica' });
  archivos.guias.set('2/guia.pdf', new Blob(['%PDF-1.4 demo'], { type: 'application/pdf' }));
  archivos.evidencias.set('2/a.jpg', foto('#c85'));
  archivos.evidencias.set('2/b.jpg', foto('#58c'));

  let sesion = null;
  const oyentes = [];
  const avisar = (ev) => oyentes.forEach((fn) => fn(ev, sesion));

  window.supabase = {
    createClient: () => ({
      from: consulta,
      storage: {
        from: (bucket) => ({
          upload: async (path, file) => { archivos[bucket].set(path, file); return { error: null }; },
          createSignedUrl: async (path) => archivos[bucket].has(path)
            ? { data: { signedUrl: URL.createObjectURL(archivos[bucket].get(path)) }, error: null }
            : { error: { message: 'Object not found' } },
          createSignedUrls: async (paths) => ({
            data: paths.filter((p) => archivos[bucket].has(p))
              .map((path) => ({ path, signedUrl: URL.createObjectURL(archivos[bucket].get(path)) })),
            error: null,
          }),
          list: async (carpeta) => ({
            data: [...archivos[bucket].keys()].filter((p) => p.startsWith(`${carpeta}/`))
              .map((p) => ({ name: p.slice(carpeta.length + 1) })),
            error: null,
          }),
          remove: async (paths) => { paths.forEach((p) => archivos[bucket].delete(p)); return { error: null }; },
        }),
      },
      auth: {
        signInWithPassword: async ({ password }) => {
          if (password !== 'demo') return { error: { message: 'Invalid login credentials' } };
          sesion = { user: { email: 'demo@enjoy.test' } };
          avisar('SIGNED_IN');
          return { error: null };
        },
        signOut: async () => { sesion = null; avisar('SIGNED_OUT'); },
        onAuthStateChange: (fn) => { oyentes.push(fn); setTimeout(() => fn('INITIAL_SESSION', sesion), 0); },
      },
    }),
  };

  // Solo para las pruebas: permite revisar los archivos sin pasar por la interfaz.
  window.__demo = { db: () => db, archivos };
})();
