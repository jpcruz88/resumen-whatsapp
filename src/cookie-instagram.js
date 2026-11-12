// Saca la cookie de un "Copy as cURL" del navegador y la guarda en .env.
// Nunca imprime ni devuelve el valor: solo dice si pudo y qué campos trae.
import { readFile, writeFile, unlink, chmod } from 'node:fs/promises';

const VARIABLE = 'INSTAGRAM_COOKIE';

// El servicio carga el .env con `. ./.env` en zsh: la cookie lleva `;` y comillas, así que va entre comillas simples.
const entreComillas = (v) => `'${v.replace(/'/g, `'\\''`)}'`;

// Arregla una línea guardada sin comillas (la primera versión del script). No muestra ni devuelve el valor.
export async function repararEnv(archivoEnv) {
  const lineas = (await readFile(archivoEnv, 'utf8')).split('\n').filter((l) => l !== '');
  const i = lineas.findIndex((l) => l.startsWith(`${VARIABLE}=`));
  if (i === -1) return { ok: false, cambio: false };
  const valor = lineas[i].slice(VARIABLE.length + 1);
  if (valor.startsWith("'") && valor.endsWith("'") && valor.length > 1) return { ok: true, cambio: false };
  lineas.splice(i, 1);
  lineas.push(`${VARIABLE}=${entreComillas(valor)}`);
  await writeFile(archivoEnv, `${lineas.join('\n')}\n`, { mode: 0o600 });
  await chmod(archivoEnv, 0o600);
  return { ok: true, cambio: true };
}

export function extraerCookie(curl) {
  const texto = String(curl ?? '');
  const patrones = [
    /(?:^|\s)(?:-b|--cookie)\s+'([^']*)'/,
    /(?:^|\s)(?:-b|--cookie)\s+"([^"]*)"/,
    /(?:^|\s)(?:-H|--header)\s+'cookie:\s*([^']*)'/i,
    /(?:^|\s)(?:-H|--header)\s+"cookie:\s*([^"]*)"/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    const valor = m?.[1]?.trim();
    if (valor && /(?:^|;\s*)sessionid=/.test(valor)) return valor;
  }
  return null;
}

export async function guardarCookie({ archivoCurl, texto, archivoEnv }) {
  const cookie = extraerCookie(texto ?? await readFile(archivoCurl, 'utf8'));
  if (!cookie) return { ok: false, campos: [] };
  let actual = '';
  try { actual = await readFile(archivoEnv, 'utf8'); } catch { /* .env nuevo */ }
  const lineas = actual.split('\n').filter((l) => l !== '' && !l.startsWith(`${VARIABLE}=`));
  lineas.push(`${VARIABLE}=${entreComillas(cookie)}`);
  await writeFile(archivoEnv, `${lineas.join('\n')}\n`, { mode: 0o600 });
  await chmod(archivoEnv, 0o600);
  if (texto === undefined) await unlink(archivoCurl);
  const campos = cookie.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean);
  return { ok: true, campos };
}
