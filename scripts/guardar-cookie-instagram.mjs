#!/usr/bin/env node
// Uso: copia el "Copy as cURL" de Instagram y corre este script.
// Toma el curl del portapapeles (o de curl-instagram.txt si existe), guarda la
// cookie en .env como INSTAGRAM_COOKIE y no muestra el valor.
import { guardarCookie } from '../src/cookie-instagram.js';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const raiz = fileURLToPath(new URL('..', import.meta.url));
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
