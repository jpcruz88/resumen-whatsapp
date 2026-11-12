#!/usr/bin/env node
// Uso: node scripts/guardar-cookie-instagram.mjs [--reparar]
// Copia el "Copy as cURL" de Instagram y corre este script.
// Toma el curl del portapapeles (o de curl-instagram.txt si existe), guarda la
// cookie en .env como INSTAGRAM_COOKIE y no muestra el valor.
import { guardarCookie, repararEnv } from '../src/cookie-instagram.js';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const raiz = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.includes('--reparar')) {
  const r = await repararEnv(`${raiz}.env`);
  console.log(!r.ok ? 'No hay INSTAGRAM_COOKIE en .env.' : r.cambio ? 'Línea de INSTAGRAM_COOKIE reparada (ahora va entre comillas).' : 'La línea ya estaba bien.');
  process.exit(r.ok ? 0 : 1);
}
const archivoCurl = `${raiz}curl-instagram.txt`;
try {
  const opciones = existsSync(archivoCurl)
    ? { archivoCurl }
    : { texto: execFileSync('pbpaste', { encoding: 'utf8' }) };
  const r = await guardarCookie({ ...opciones, archivoEnv: `${raiz}.env` });
  if (!r.ok) { console.error('No encontré una cookie con sessionid en el portapapeles ni en curl-instagram.txt. No cambié nada.'); process.exit(1); }
  console.log(`Cookie guardada en .env. Campos: ${r.campos.join(', ')}.`);
} catch (e) {
  console.error(`Error: ${e.code ?? 'desconocido'}`);
  process.exit(1);
}
