// Saca la cookie de un "Copy as cURL" del navegador y la guarda en .env.
// Nunca imprime ni devuelve el valor: solo dice si pudo y qué campos trae.
import { readFile, writeFile, unlink, chmod } from 'node:fs/promises';

const VARIABLE = 'INSTAGRAM_COOKIE';

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

export async function guardarCookie({ archivoCurl, archivoEnv }) {
  const cookie = extraerCookie(await readFile(archivoCurl, 'utf8'));
  if (!cookie) return { ok: false, campos: [] };
  let actual = '';
  try { actual = await readFile(archivoEnv, 'utf8'); } catch { /* .env nuevo */ }
  const lineas = actual.split('\n').filter((l) => l !== '' && !l.startsWith(`${VARIABLE}=`));
  lineas.push(`${VARIABLE}=${cookie}`);
  await writeFile(archivoEnv, `${lineas.join('\n')}\n`, { mode: 0o600 });
  await chmod(archivoEnv, 0o600);
  await unlink(archivoCurl);
  const campos = cookie.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean);
  return { ok: true, campos };
}
