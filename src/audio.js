// Conversión de audio para que los mensajes de voz de WhatsApp (.ogg/opus) suenen también en Safari y en
// el iPhone, que no reproducen ogg. Usa ffmpeg si está instalado; si no, el reproductor usa solo el .ogg.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CANDIDATOS = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];

// launchd arranca con un PATH mínimo, así que se buscan rutas conocidas en vez de confiar en el PATH.
export function buscarFfmpeg({ existe = existsSync, env = process.env } = {}) {
  return [env.FFMPEG_PATH, ...CANDIDATOS].filter(Boolean).find((ruta) => existe(ruta)) ?? null;
}

// Argumentos separados, sin shell: los nombres de archivo nunca se interpretan como comandos.
export function convertirAM4a({ origen, destino, ffmpeg, spawnFn = spawn, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const proceso = spawnFn(
      ffmpeg,
      ['-y', '-v', 'error', '-i', origen, '-vn', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', destino],
      { stdio: 'ignore' },
    );
    const reloj = setTimeout(() => {
      proceso.kill?.();
      reject(new Error('ffmpeg tardó demasiado'));
    }, timeoutMs);
    proceso.on('error', (e) => { clearTimeout(reloj); reject(new Error(`ffmpeg no arrancó: ${e.message}`)); });
    proceso.on('close', (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) resolve();
      else reject(new Error(`ffmpeg terminó con código ${codigo}`));
    });
  });
}
