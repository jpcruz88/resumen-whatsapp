import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generarReporte } from '../src/reportar.js';
import { Almacen } from '../src/almacen.js';

const CHAT = 'a@g.us';

function fakeFetch({ fallarAudio = false } = {}) {
  const fn = async (url, opts) => {
    fn.llamadas.push(opts.body);
    const esAudio = opts.body.includes('audio/ogg');
    if (esAudio && fallarAudio) return { ok: false, status: 500, text: async () => 'e', json: async () => ({}) };
    const texto = esAudio ? 'transcripcion' : '## Trabajo\n- resumen listo';
    return { ok: true, status: 200, text: async () => '', json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
  };
  fn.llamadas = [];
  return fn;
}

async function montar(vigilado) {
  const base = await mkdtemp(join(tmpdir(), 'rep-'));
  const vigilados = { esVigilado: async (j) => vigilado && j === CHAT };
  const almacen = new Almacen({ dir: join(base, 'datos'), vigilados: { esVigilado: async () => true } });
  return { base, vigilados, almacen };
}

test('chat no vigilado: rechaza sin leer ni llamar a Gemini', async () => {
  const { base, vigilados, almacen } = await montar(false);
  let leyo = false;
  almacen.leer = async () => { leyo = true; return []; };
  const fetchFn = fakeFetch();
  await assert.rejects(
    () => generarReporte({ chat: CHAT, almacen, vigilados, medios: { apiKey: 'k', fetchFn }, dirReportes: join(base, 'r') }),
    /chat no vigilado/,
  );
  assert.equal(leyo, false);
  assert.equal(fetchFn.llamadas.length, 0);
});

test('un audio que falla no impide el reporte y dice "no se pudo procesar"', async () => {
  const { base, vigilados, almacen } = await montar(true);
  await almacen.guardar({ id: '1', chat: CHAT, tipo: 'audio', texto: '', mediaId: 'M1', mimetype: 'audio/ogg', fecha: '2026-11-09T10:00:00Z', propio: false });
  await almacen.guardarMedio({ chat: CHAT, mediaId: 'M1', mimetype: 'audio/ogg', buffer: Buffer.from('x') });
  const fetchFn = fakeFetch({ fallarAudio: true });
  const { id, url } = await generarReporte({
    chat: CHAT, desde: '2026-11-09T00:00:00Z', hasta: '2026-11-10T00:00:00Z',
    almacen, vigilados, medios: { apiKey: 'k', fetchFn }, dirReportes: join(base, 'r'),
  });
  assert.ok(url.startsWith('/reportes/'));
  assert.equal(url, `/reportes/${id}`);
  assert.ok(fetchFn.llamadas.some((b) => b.includes('no se pudo procesar')));
  const html = await readFile(join(base, 'r', `${id}.html`), 'utf8');
  assert.ok(html.includes('resumen listo'));
});

test('el reporte lleva el nombre del chat y la cantidad de mensajes', async () => {
  const { base, vigilados, almacen } = await montar(true);
  await almacen.guardar({ id: '1', chat: CHAT, tipo: 'texto', texto: 'hola', fecha: '2026-11-09T10:00:00Z', propio: false });
  await almacen.guardar({ id: '2', chat: CHAT, tipo: 'texto', texto: 'qué tal', fecha: '2026-11-09T10:05:00Z', propio: true });
  const fetchFn = fakeFetch();
  const { id } = await generarReporte({
    chat: CHAT, nombre: 'Bodega Norte', desde: '2026-11-09T00:00:00Z', hasta: '2026-11-10T00:00:00Z',
    almacen, vigilados, medios: { apiKey: 'k', fetchFn }, dirReportes: join(base, 'r'),
  });
  const html = await readFile(join(base, 'r', `${id}.html`), 'utf8');
  assert.match(html, /<h1>Bodega Norte<\/h1>/);
  assert.match(html, /2 mensajes/);
  assert.match(html, /Desarrollado por JP/);
});

test('sin mensajes el reporte explica desde cuándo se vigila y no llama a Gemini', async () => {
  const { base, almacen } = await montar(true);
  const desdeVigilar = new Date(2026, 10, 9, 19, 56, 0, 0).toISOString();
  const vigilados = { esVigilado: async () => true, desdeDe: async () => desdeVigilar };
  const fetchFn = fakeFetch();
  const { id } = await generarReporte({
    chat: CHAT, nombre: 'Bodega Norte', desde: '2026-11-09T00:00:00Z', hasta: '2026-11-10T00:00:00Z',
    almacen, vigilados, medios: { apiKey: 'k', fetchFn }, dirReportes: join(base, 'r'),
  });
  assert.equal(fetchFn.llamadas.length, 0);
  const html = await readFile(join(base, 'r', `${id}.html`), 'utf8');
  assert.match(html, /Se empezó a vigilar el 9 de noviembre de 2026, 19:56/);
});

test('un audio anterior a la vigilancia no se transcribe ni se pide a Evolution', async () => {
  const { base, vigilados, almacen } = await montar(true);
  await almacen.guardar({ id: 'h1', chat: CHAT, tipo: 'audio', texto: null, mediaId: 'MH', mimetype: 'audio/ogg', fecha: '2026-11-09T10:00:00Z', propio: false, sinMedio: true });
  await almacen.guardar({ id: 'h2', chat: CHAT, tipo: 'texto', texto: 'hola', fecha: '2026-11-09T10:01:00Z', propio: false });
  const fetchFn = fakeFetch();
  let descargas = 0;
  const evolution = { descargarMedia: async () => { descargas++; throw new Error('no está en la base'); } };
  const { id } = await generarReporte({
    chat: CHAT, desde: '2026-11-09T00:00:00Z', hasta: '2026-11-10T00:00:00Z',
    almacen, vigilados, evolution, medios: { apiKey: 'k', fetchFn }, dirReportes: join(base, 'r'),
  });
  assert.equal(descargas, 0);
  assert.equal(fetchFn.llamadas.filter((b) => b.includes('audio/ogg')).length, 0, 'no se manda ningún audio a Gemini');
  assert.ok(fetchFn.llamadas.some((b) => b.includes('[audio anterior a la vigilancia: no disponible]')));
  await readFile(join(base, 'r', `${id}.html`), 'utf8');
});

test('el reporte generado enlaza a la conversación del mismo chat y periodo', async () => {
  const { base, vigilados, almacen } = await montar(true);
  await almacen.guardar({ id: '1', chat: CHAT, tipo: 'texto', texto: 'hola', fecha: '2026-11-09T10:00:00Z', propio: false });
  const { id } = await generarReporte({
    chat: CHAT, nombre: 'X', desde: '2026-11-09T00:00:00.000Z', hasta: '2026-11-10T00:00:00.000Z',
    almacen, vigilados, medios: { apiKey: 'k', fetchFn: fakeFetch() }, dirReportes: join(base, 'r'),
  });
  const html = await readFile(join(base, 'r', `${id}.html`), 'utf8');
  const enlace = html.match(/<a class="boton-enlace" href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  const q = new URL(enlace, 'http://x');
  assert.equal(q.pathname, '/conversacion');
  assert.equal(q.searchParams.get('chat'), CHAT);
  assert.equal(q.searchParams.get('desde'), '2026-11-09T00:00:00.000Z');
  assert.equal(q.searchParams.get('hasta'), '2026-11-10T00:00:00.000Z');
});
