// Sirve la página con una base de datos falsa en memoria (se reinicia al recargar).
// Entrar con cualquier correo y la contraseña "demo".
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PUERTO = Number(process.env.PORT) || 5173;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const SUSTITUTOS = { '/vendor/supabase.js': 'tests/demo-supabase.js' };
const CONFIG_DEMO = `window.CONFIG = { supabaseUrl: 'https://demo.local', supabaseKey: 'demo' };`;

createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  if (ruta === '/config.js') {
    res.writeHead(200, { 'content-type': TIPOS['.js'] }).end(CONFIG_DEMO);
    return;
  }
  const relativa = SUSTITUTOS[ruta] ?? normalize(ruta === '/' ? 'index.html' : ruta.slice(1));
  try {
    if (relativa.startsWith('..')) throw new Error('fuera de la raíz');
    const cuerpo = await readFile(join(RAIZ, relativa));
    res.writeHead(200, { 'content-type': TIPOS[extname(relativa)] ?? 'application/octet-stream' }).end(cuerpo);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(PUERTO, () => console.log(`Demo en http://localhost:${PUERTO} (contraseña: demo)`));
