# Control de garantías · Enjoy Videogames

Tabla para llevar cada caso de garantía desde que el producto llega a la tienda hasta que se entrega al cliente.

- **Página:** HTML, CSS y JavaScript sin compilación. Se publica en GitHub Pages.
- **Base de datos y PDFs:** Supabase (`supabase/schema.sql`).

## Cómo funciona un caso

| Paso | Qué se hace | Estado resultante |
|---|---|---|
| 1. Abrir caso | Pedido, cliente, número, fecha de recibido, quién recibe, producto, serial y falla | Recibido en tienda |
| 2. Registrar envío | Fecha de envío + **PDF de la guía y de 1 a 5 fotos de evidencia (obligatorios)** | Enviado a fábrica |
| 3. Registrar recibido | Fecha en que vuelve de fábrica | Devuelto a tienda |
| 4. Entregar | Un clic | Entregado al cliente |

Los estados excepcionales, **Pedido producto reposición** y **Cambio de producto**, se marcan desde el detalle del caso (clic en el número `#`). Todo cambio de estado queda en el historial con fecha y usuario. En ese mismo detalle están **Editar**, para corregir errores, y **Eliminar**, que pide confirmación y borra de forma definitiva el caso, su historial, la guía y las fotos.

La página funciona en computador, tablet y celular. En pantallas de hasta 1100 px cada caso se muestra como una tarjeta.

## Constancia de recepción

**Generar PDF** descarga un documento para entregar al cliente con los datos del caso, la fecha de recibido, quién lo recibió, un espacio para firmas y un resumen de la política de garantía. A propósito no incluye el estado del caso.

El resumen de la política está en `constancia.js` (`POLITICA`) y resume [la política publicada](https://enjoyvideogames.com.co/garantia/), revisada el 2026-11-04. **Si la política cambia en la web, hay que actualizarlo ahí.** Los datos de la empresa están en `EMPRESA`, en el mismo archivo.

## Puesta en marcha

### 1. Base de datos (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega todo `supabase/schema.sql` y ejecútalo.
3. **Importante:** en **Authentication > Sign In / Providers**, desactiva **Allow new users to sign up**. Si queda activo, cualquiera que encuentre la página puede crearse una cuenta y ver los datos de los clientes.
4. En **Authentication > Users > Add user**, crea un usuario por cada persona de la tienda.

### 2. Conectar la página

En **Project Settings > API** copia la URL y la clave pública (`anon` / `publishable`), y ponlas en `config.js`. Nunca pongas ahí la clave `service_role` / `secret`.

### 3. Publicar (GitHub Pages)

1. Crea un repositorio en GitHub y sube este proyecto.
2. En **Settings > Pages**, elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.

En el plan gratis de GitHub, Pages exige que el repositorio sea público, y la dirección de la página queda abierta en internet. No hay datos de clientes en el repositorio ni en la página: viven en Supabase, detrás del inicio de sesión.

## Respaldos y plan gratis

- El plan gratis de Supabase **pausa el proyecto tras una semana sin uso** (se reactiva desde su panel). Para evitarlo, la tarea `.github/workflows/mantener-activa.yml` hace una consulta mínima los lunes y jueves, usando los datos de `config.js`. Mientras `config.js` no esté conectado, la tarea termina sin hacer nada.
  - **Comprobarla:** después de conectar la base de datos, ve a la pestaña **Actions > Mantener Supabase activo > Run workflow**. Debe terminar en verde con el mensaje "Supabase activo".
  - **Reactivarla:** GitHub desactiva las tareas programadas si el repositorio pasa 60 días sin cambios. Avisa por correo a la cuenta dueña; se reactiva en esa misma pestaña con **Enable workflow**.
- El plan gratis **no incluye respaldos automáticos**, y la tarea anterior no los reemplaza. Conviene exportar los casos periódicamente o pasar al plan pago.
- Las fotos se reducen a un máximo de 2000 px en JPG antes de subirlas, para no consumir rápido el espacio del plan gratis (1 GB).

## Cambios en la base de datos

`supabase/schema.sql` siempre describe la base completa y sirve para un proyecto nuevo. Un proyecto existente se actualiza ejecutando una sola vez, en orden, los archivos de `supabase/migraciones/`.

## Desarrollo

```bash
npm install
```

```bash
npm test
```

Corre `schema.sql` en un Postgres embebido y revisa reglas y permisos.

```bash
npm run demo
```

Abre la página en `http://localhost:5173` con una base falsa en memoria (`tests/demo-supabase.js`), que se reinicia al recargar. Entra con cualquier correo y la contraseña `demo`.

`vendor/` guarda las copias que usa la página: `@supabase/supabase-js` (`dist/umd/supabase.js`) y `jspdf` (`dist/jspdf.umd.min.js`). Si actualizas un paquete, vuelve a copiar su archivo.
