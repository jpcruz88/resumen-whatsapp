#!/usr/bin/env node
// Uso: cd /Users/jp/resumen-whatsapp && set -a && . ./.env && set +a && node scripts/resumir-video.mjs "<enlace del reel>"
// Baja el video con yt-dlp (con INSTAGRAM_COOKIE si está en el entorno) y lo resume con Gemini.
// El video y la cookie temporal se borran al terminar. No envía nada a Instagram.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { descargarVideo, resumirVideo } from '../src/video.js';

const url = process.argv[2];
if (!url) { console.error('Uso: node scripts/resumir-video.mjs "<enlace de Instagram>"'); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error('Falta GEMINI_API_KEY: carga el .env (set -a && . ./.env && set +a).'); process.exit(1); }

const dir = await mkdtemp(join(tmpdir(), 'resumen-video-'));
try {
  const ruta = await descargarVideo({ url, cookie: process.env.INSTAGRAM_COOKIE, dir });
  console.log(await resumirVideo({ ruta, apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || undefined }));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
