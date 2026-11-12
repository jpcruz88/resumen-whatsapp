// Resume un video de Instagram: lo baja con yt-dlp (con la sesión del usuario si hay INSTAGRAM_COOKIE) y se
// lo manda a Gemini. La cookie viaja en un archivo temporal de modo 600 que se borra siempre; nunca va en
// los argumentos del comando, en errores ni en registros.
import { readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, extname } from 'node:path';

const MIMES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska' };
const PROMPT = 'Resume este video en español. Di de qué trata, lo más importante de lo que se dice o muestra y, si hay una instrucción, dato o llamado a la acción, indícalo. Sé breve y concreto. Si el audio no se entiende, dilo.';

export function urlValida(texto) {
  let u;
  try { u = new URL(String(texto)); } catch { return false; }
  return u.protocol === 'https:' && (u.hostname === 'instagram.com' || u.hostname === 'www.instagram.com');
}

// Formato Netscape, el que lee yt-dlp con --cookies.
export function cookieANetscape(cookie) {
  const filas = String(cookie).split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return i > 0 ? `.instagram.com\tTRUE\t/\tTRUE\t2000000000\t${p.slice(0, i)}\t${p.slice(i + 1)}` : null;
  }).filter(Boolean);
  return `# Netscape HTTP Cookie File\n${filas.join('\n')}\n`;
}

const execFileP = promisify(execFile);
// Con launchd el PATH no incluye Homebrew: se busca yt-dlp en su sitio habitual. Tope de 3 minutos.
const YT_DLP = process.env.YT_DLP || ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp'].find((r) => existsSync(r)) || 'yt-dlp';
const ejecutarPorDefecto = (_cmd, args) => execFileP(YT_DLP, args, { timeout: 180_000 });

export async function descargarVideo({ url, cookie, dir, ejecutar = ejecutarPorDefecto }) {
  if (!urlValida(url)) throw new Error('Pasa un enlace de Instagram (https://www.instagram.com/...)');
  const archivoCookie = cookie ? join(dir, 'cookies.txt') : null;
  try {
    const args = ['--no-playlist', '--max-filesize', '100M', '-o', join(dir, 'video.%(ext)s')];
    if (archivoCookie) {
      await writeFile(archivoCookie, cookieANetscape(cookie), { mode: 0o600 });
      args.push('--cookies', archivoCookie);
    }
    args.push(url);
    try {
      await ejecutar('yt-dlp', args);
    } catch (e) {
      const motivo = e.code === 'ENOENT' ? 'yt-dlp no está instalado (brew install yt-dlp)'
        : String(e.stderr ?? '').split('\n').find((l) => l.startsWith('ERROR')) ?? 'yt-dlp falló';
      throw new Error(`No se pudo bajar el video: ${motivo.replace(/sessionid=\S+/g, 'sessionid=…')}`);
    }
    const archivo = (await readdir(dir)).find((f) => f.startsWith('video.') && MIMES[extname(f)]);
    if (!archivo) throw new Error('No se pudo bajar el video: yt-dlp no dejó ningún archivo de video');
    return join(dir, archivo);
  } finally {
    if (archivoCookie) await rm(archivoCookie, { force: true });
  }
}

// Gemini acepta el video dentro de la petición hasta ~20 MB.
export async function resumirVideo({ ruta, apiKey, model = 'gemini-3.1-flash-lite', maxBytes = 18 * 1024 * 1024, fetchFn = fetch }) {
  const mimeType = MIMES[extname(ruta)] ?? 'video/mp4';
  if ((await stat(ruta)).size > maxBytes) throw new Error('El video es demasiado grande para resumirlo directo (máximo ~18 MB)');
  const datos = (await readFile(ruta)).toString('base64');
  const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType, data: datos } }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
  const json = await res.json();
  const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!texto) throw new Error('Gemini no devolvió texto');
  return texto;
}
