#!/usr/bin/env node
// Uso: node scripts/guardar-cookie-instagram.mjs
// Lee ./curl-instagram.txt (el "Copy as cURL" de Instagram), guarda la cookie
// en .env como INSTAGRAM_COOKIE y borra el archivo. No muestra el valor.
import { guardarCookie } from '../src/cookie-instagram.js';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
try {
  const r = await guardarCookie({ archivoCurl: `${raiz}curl-instagram.txt`, archivoEnv: `${raiz}.env` });
  if (!r.ok) { console.error('No encontré una cookie con sessionid en curl-instagram.txt. No cambié nada.'); process.exit(1); }
  console.log(`Cookie guardada en .env. Campos: ${r.campos.join(', ')}. Borré curl-instagram.txt.`);
} catch (e) {
  console.error(e.code === 'ENOENT' ? 'Falta curl-instagram.txt en la raíz del proyecto.' : `Error: ${e.code ?? 'desconocido'}`);
  process.exit(1);
}
