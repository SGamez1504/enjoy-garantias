// Doble en memoria de supabase-js, solo para `npm run demo`. Nunca se publica en uso real:
// tests/demo-server.mjs lo sirve en lugar de vendor/supabase.js. Replica las mismas
// reglas de supabase/schema.sql para poder probar la página sin un proyecto real.
(() => {
  const ahora = () => new Date().toISOString();
  const db = { casos: [], caso_historial: [] };
  const archivos = new Map();
  let nextId = 1;
  let nextHist = 1;

  function revisar(c) {
    if (!['recibido_tienda', 'enviado_fabrica', 'devuelto_tienda', 'entregado_cliente', 'pedido_reposicion', 'cambio_producto'].includes(c.estado)) return 'casos_estado_valido';
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
  const violacion = (r) => ({ error: { message: `new row violates check constraint "${r}"` } });

  function crear(o) {
    const c = {
      id: nextId++, fecha_envio: null, guia_path: null, guia_nombre: null, fecha_devolucion: null,
      estado: 'recibido_tienda', created_at: ahora(), updated_at: ahora(), ...o,
    };
    const r = revisar(c);
    if (r) return violacion(r);
    db.casos.push(c);
    historial(c.id, c.estado);
    return { error: null };
  }

  function consulta(tabla) {
    const q = { filtros: [], orden: null, rango: null, cambios: null };
    const api = {
      select: () => api,
      eq: (k, v) => { q.filtros.push([k, v]); return api; },
      order: (k, o = {}) => { q.orden = [k, o.ascending !== false]; return api; },
      range: (a, b) => { q.rango = [a, b]; return api; },
      insert: (o) => Promise.resolve(crear(o)),
      update: (o) => { q.cambios = o; return api; },
      then: (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko),
    };
    function ejecutar() {
      let filas = db[tabla].filter((f) => q.filtros.every(([k, v]) => f[k] === v));
      if (q.cambios) {
        for (const f of filas) {
          const nuevo = { ...f, ...q.cambios };
          const r = revisar(nuevo);
          if (r) return violacion(r);
          if (nuevo.estado !== f.estado) historial(f.id, nuevo.estado);
          Object.assign(f, nuevo);
        }
        return { error: null };
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

  crear({ numero_pedido: 'EV-10231', cliente_nombre: 'Laura Méndez', cliente_numero: '300 555 0142', fecha_recibido: '2026-10-28', producto: 'Control DualSense', numero_serial: 'DS5-88213', falla: 'Drift en el stick izquierdo' });
  crear({ numero_pedido: 'EV-10198', cliente_nombre: 'Andrés Rojas', cliente_numero: '310 555 0187', fecha_recibido: '2026-10-20', producto: 'Nintendo Switch OLED', numero_serial: 'XTW70012345', falla: 'No carga por el puerto USB-C, se apaga al conectar el dock', fecha_envio: '2026-10-22', guia_path: 'demo/guia.pdf', guia_nombre: 'guia-demo.pdf', estado: 'enviado_fabrica' });
  archivos.set('demo/guia.pdf', new Blob(['%PDF-1.4 demo'], { type: 'application/pdf' }));

  let sesion = null;
  const oyentes = [];
  const avisar = (ev) => oyentes.forEach((fn) => fn(ev, sesion));

  window.supabase = {
    createClient: () => ({
      from: consulta,
      storage: {
        from: () => ({
          upload: async (path, file) => { archivos.set(path, file); return { error: null }; },
          createSignedUrl: async (path) => archivos.has(path)
            ? { data: { signedUrl: URL.createObjectURL(archivos.get(path)) }, error: null }
            : { error: { message: 'Object not found' } },
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
})();
