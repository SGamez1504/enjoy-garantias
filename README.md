# Control de garantías · Enjoy Videogames

Tabla para llevar cada caso de garantía desde que el producto llega a la tienda hasta que se entrega al cliente.

- **Página:** HTML, CSS y JavaScript sin compilación. Se publica en GitHub Pages.
- **Base de datos y PDFs:** Supabase (`supabase/schema.sql`).

## Cómo funciona un caso

| Paso | Qué se hace | Estado resultante |
|---|---|---|
| 1. Abrir caso | Pedido, cliente, número, fecha de recibido, producto, serial y falla | Recibido en tienda |
| 2. Registrar envío | Fecha de envío + **PDF de la guía (obligatorio)** | Enviado a fábrica |
| 3. Registrar recibido | Fecha en que vuelve de fábrica | Devuelto a tienda |
| 4. Entregar | Un clic | Entregado al cliente |

Los estados excepcionales, **Pedido producto reposición** y **Cambio de producto**, se marcan desde el detalle del caso (clic en el número `#`). Todo cambio de estado queda en el historial con fecha y usuario. Los errores se corrigen con **Editar**, en el mismo detalle.

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

- El plan gratis de Supabase **pausa el proyecto tras una semana sin uso** (se reactiva desde su panel) y **no incluye respaldos automáticos**. Para datos de clientes conviene exportar periódicamente o pasar al plan pago.
- Los casos no se pueden borrar desde la página, a propósito. Si hace falta, se borran desde el panel de Supabase.

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

`vendor/supabase.js` es la copia de `@supabase/supabase-js` (`dist/umd/supabase.js`) que usa la página. Si actualizas el paquete, vuelve a copiarla.
