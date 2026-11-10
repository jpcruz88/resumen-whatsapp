import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { parsearHistorial, parsearEventoEvolution } from '../src/parse.js';
import { crearClienteEvolution } from '../src/evolution.js';
import { crearRecuperacion } from '../src/recuperar.js';
import { crearConversacion, renderConversacion } from '../src/conversacion.js';
import { crearRouter } from '../src/servidor.js';

const CHAT = '120363000000000001@g.us';
const AUTOR = '100000000000001@lid';
const loc = (a, m, d, h = 0) => new Date(a, m, d, h, 0, 0, 0).toISOString();

// imageMessage como lo manda Evolution en el historial: bytes como objeto {0:..}, cadenas base64 y una miniatura enorme.
const imagen = (extra = {}) => ({
  url: 'https://mmg.whatsapp.net/o1/v/t24/f2/m233/AQ', directPath: '/o1/v/t24/f2/m233/AQ', mimetype: 'image/jpeg',
  mediaKey: { 0: 7, 1: 8, 2: 9 }, fileEncSha256: 'AQID', fileSha256: [4, 5, 6],
  fileLength: { low: 2048, high: 0, unsigned: false }, mediaKeyTimestamp: '1762000000', height: 800, width: 600, caption: 'la factura',
  jpegThumbnail: { 0: 1, 1: 2 }, scanLengths: [1, 2, 3], midQualityFileSha256: 'xx', ...extra,
});
const mensaje = (id, message, extra = {}) => ({
  key: { remoteJid: CHAT, fromMe: false, id, participant: AUTOR }, pushName: '100000000000001', message, messageTimestamp: 1762000000, ...extra,
});
const lote = (...datos) => ({ event: 'messages.set', instance: 'resumen', data: datos });

// ---------- parseo: los datos de descarga ----------

test('el historial conserva solo los datos necesarios para volver a pedir la imagen, con los bytes normalizados', () => {
  const [m] = parsearHistorial(lote(mensaje('IMG1', { imageMessage: imagen() })));
  assert.equal(m.tipo, 'imagen');
  assert.equal(m.sinMedio, true);
  assert.deepEqual(m.medio.mediaKey, [7, 8, 9]);
  assert.deepEqual(m.medio.fileEncSha256, [1, 2, 3], 'una cadena base64 pasa a bytes');
  assert.deepEqual(m.medio.fileSha256, [4, 5, 6]);
  assert.equal(m.medio.fileLength, 2048, 'un número largo de protobuf pasa a número');
  assert.equal(m.medio.mediaKeyTimestamp, 1762000000);
  assert.equal(m.medio.directPath, '/o1/v/t24/f2/m233/AQ');
  assert.equal(m.medio.mimetype, 'image/jpeg');
  for (const sobra of ['jpegThumbnail', 'scanLengths', 'midQualityFileSha256', 'caption']) assert.equal(sobra in m.medio, false, sobra);
});

test('un audio guarda si es nota de voz y su duración; el texto no lleva datos de medio', () => {
  const [a, t] = parsearHistorial(lote(
    mensaje('AUD1', { audioMessage: { url: 'u', directPath: '/d', mimetype: 'audio/ogg; codecs=opus', mediaKey: [1, 2], ptt: true, seconds: 12, waveform: 'AAAA' } }),
    mensaje('T1', { conversation: 'hola' }),
  ));
  assert.equal(a.medio.ptt, true);
  assert.equal(a.medio.seconds, 12);
  assert.equal('waveform' in a.medio, false);
  assert.equal('medio' in t, false);
});

test('sin mediaKey o sin ruta de descarga no se guarda un medio inservible', () => {
  const [m] = parsearHistorial(lote(mensaje('IMG2', { imageMessage: { mimetype: 'image/jpeg' } })));
  assert.equal(m.sinMedio, true);
  assert.equal('medio' in m, false);
});

test('un mensaje en vivo también guarda los datos de descarga (por si se borra el archivo)', () => {
  const p = parsearEventoEvolution({ event: 'messages.upsert', data: mensaje('IMG3', { imageMessage: imagen(), base64: 'AAAA' }) });
  assert.deepEqual(p.medio.mediaKey, [7, 8, 9]);
  assert.equal('base64' in p.medio, false);
});

// ---------- almacén: completar lo ya guardado y buscar un mensaje ----------

async function montar() {
  const dir = await mkdtemp(join(tmpdir(), 'recuperar-'));
  const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  await vigilados.activar(CHAT);
  const almacen = new Almacen({ dir, vigilados });
  return { dir, vigilados, almacen };
}
const base = { chat: CHAT, esGrupo: true, propio: false, nombre: 'x', autor: AUTOR, fecha: loc(2026, 10, 9, 10) };

test('volver a importar el historial completa los mensajes viejos con sus datos de descarga, sin duplicarlos', async () => {
  const { dir, almacen } = await montar();
  try {
    await almacen.guardarLote([{ ...base, id: 'IMG1', tipo: 'imagen', texto: 'foto', mediaId: 'IMG1', mimetype: 'image/jpeg', sinMedio: true }]);
    assert.equal('medio' in (await almacen.leer({ chat: CHAT }))[0], false);
    const r = await almacen.guardarLoteDetallado(parsearHistorial(lote(mensaje('IMG1', { imageMessage: imagen() }))));
    assert.deepEqual(r, { nuevos: 0, actualizados: 1 });
    const guardados = await almacen.leer({ chat: CHAT });
    assert.equal(guardados.length, 1);
    assert.deepEqual(guardados[0].medio.mediaKey, [7, 8, 9]);
    assert.equal(guardados[0].texto, 'foto', 'lo demás del mensaje no cambia');
    const otra = await almacen.guardarLoteDetallado(parsearHistorial(lote(mensaje('IMG1', { imageMessage: imagen() }))));
    assert.deepEqual(otra, { nuevos: 0, actualizados: 0 }, 'a la tercera ya no hay nada que completar');
    assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith('.tmp')), [], 'no quedan archivos temporales');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('guardarLote sigue devolviendo solo cuántos mensajes nuevos guardó', async () => {
  const { dir, almacen } = await montar();
  try {
    assert.equal(await almacen.guardarLote(parsearHistorial(lote(mensaje('A', { conversation: 'a' }), mensaje('B', { conversation: 'b' })))), 2);
    assert.equal(await almacen.guardarLote(parsearHistorial(lote(mensaje('A', { conversation: 'a' })))), 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('buscarMensaje encuentra un mensaje por su id dentro de un chat vigilado', async () => {
  const { dir, almacen } = await montar();
  try {
    await almacen.guardarLote([{ ...base, id: 'M1', tipo: 'texto', texto: 'hola' }]);
    assert.equal((await almacen.buscarMensaje({ chat: CHAT, id: 'M1' })).texto, 'hola');
    assert.equal(await almacen.buscarMensaje({ chat: CHAT, id: 'NO' }), null);
    assert.equal(await almacen.buscarMensaje({ chat: 'otro@g.us', id: 'M1' }), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- Evolution: pedir la imagen con el mensaje completo ----------

test('recuperarMedia manda a Evolution el mensaje completo (sin depender de su base) y decodifica el archivo', async () => {
  let pedido;
  const fetchFn = async (url, opts) => {
    pedido = { url, opts, cuerpo: JSON.parse(opts.body) };
    return { ok: true, status: 200, json: async () => ({ base64: Buffer.from('bytes').toString('base64'), mimetype: 'image/jpeg' }) };
  };
  const c = crearClienteEvolution({ url: 'http://evo', apiKey: 'K', instancia: 'i', fetchFn });
  const r = await c.recuperarMedia({ chat: CHAT, id: 'IMG1', propio: false, autor: AUTOR, tipo: 'imagen', medio: { directPath: '/d', mediaKey: [1, 2] } });
  assert.equal(r.buffer.toString(), 'bytes');
  assert.equal(r.mimetype, 'image/jpeg');
  assert.equal(pedido.url, 'http://evo/chat/getBase64FromMediaMessage/i');
  assert.equal(pedido.opts.headers.apikey, 'K');
  assert.deepEqual(pedido.cuerpo.message.key, { id: 'IMG1', remoteJid: CHAT, fromMe: false, participant: AUTOR });
  assert.deepEqual(pedido.cuerpo.message.message, { imageMessage: { directPath: '/d', mediaKey: [1, 2] } });
  assert.equal(pedido.cuerpo.convertToMp4, false);
  await c.recuperarMedia({ chat: CHAT, id: 'A1', propio: true, tipo: 'audio', medio: { directPath: '/d' } });
  assert.deepEqual(pedido.cuerpo.message.key, { id: 'A1', remoteJid: CHAT, fromMe: true });
  assert.ok('audioMessage' in pedido.cuerpo.message.message);
});

test('recuperarMedia da un error claro con el estado y el motivo cuando Evolution no puede', async () => {
  const fetchFn = async () => ({ ok: false, status: 400, text: async () => '{"error":"Bad Request","message":["Message not found"]}', json: async () => ({}) });
  const c = crearClienteEvolution({ url: 'http://evo', apiKey: 'K', instancia: 'i', fetchFn });
  await assert.rejects(c.recuperarMedia({ chat: CHAT, id: 'X', tipo: 'imagen', medio: {} }), /400.*Message not found/s);
});

// ---------- el manejador de recuperación ----------

const fotoMsg = (extra = {}) => ({ ...base, id: 'IMG1', tipo: 'imagen', texto: 'foto', mediaId: 'IMG1', mimetype: 'image/jpeg', sinMedio: true, medio: { directPath: '/d', mediaKey: [1, 2] }, ...extra });
const pedir = (h, cuerpo) => h({ metodo: 'POST', ruta: '/medios/recuperar', cuerpo });

test('recupera una imagen vieja, la guarda y devuelve su dirección', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    await almacen.guardarLote([fotoMsg()]);
    const llamadas = [];
    const evolution = { recuperarMedia: async (a) => { llamadas.push(a); return { buffer: Buffer.from('png-real'), mimetype: 'image/jpeg' }; } };
    const h = crearRecuperacion({ almacen, vigilados, evolution, pausaMs: 0 });
    const r = await pedir(h, { chat: CHAT, id: 'IMG1' });
    assert.deepEqual(r, { estado: 200, cuerpo: { ok: true, url: '/medios/IMG1' } });
    assert.equal((await readFile(almacen.rutaMedio({ mediaId: 'IMG1', mimetype: 'image/jpeg' }))).toString(), 'png-real');
    assert.equal(llamadas[0].tipo, 'imagen');
    assert.equal(llamadas[0].autor, AUTOR);
    assert.deepEqual(llamadas[0].medio, { directPath: '/d', mediaKey: [1, 2] });
    // Si ya está guardada no se vuelve a pedir.
    const otra = await pedir(h, { chat: CHAT, id: 'IMG1' });
    assert.equal(otra.cuerpo.url, '/medios/IMG1');
    assert.equal(llamadas.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rechaza un chat no vigilado, un mensaje que no existe y uno sin datos de descarga', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    await almacen.guardarLote([fotoMsg(), fotoMsg({ id: 'SIN', mediaId: 'SIN', medio: undefined })]);
    const evolution = { recuperarMedia: async () => { throw new Error('no debe llamarse'); } };
    const h = crearRecuperacion({ almacen, vigilados, evolution, pausaMs: 0 });
    assert.equal((await pedir(h, { chat: 'otro@g.us', id: 'IMG1' })).estado, 403);
    assert.equal((await pedir(h, { chat: CHAT, id: 'NO-EXISTE' })).estado, 404);
    assert.equal((await pedir(h, { chat: CHAT, id: 'SIN' })).estado, 409);
    assert.equal((await pedir(h, { chat: CHAT })).estado, 400);
    assert.equal((await pedir(h, undefined)).estado, 400);
    assert.equal((await pedir(h, { chat: CHAT, id: { $ne: 1 } })).estado, 400);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('si WhatsApp ya no tiene el archivo responde 502 con un motivo claro y no deja nada guardado', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    await almacen.guardarLote([fotoMsg()]);
    const evolution = { recuperarMedia: async () => { throw new Error('Evolution respondió 400: media expirada con datos internos'); } };
    const h = crearRecuperacion({ almacen, vigilados, evolution, pausaMs: 0 });
    const r = await pedir(h, { chat: CHAT, id: 'IMG1' });
    assert.equal(r.estado, 502);
    assert.match(r.cuerpo.error, /ya no está disponible en WhatsApp/i);
    assert.ok(!JSON.stringify(r.cuerpo).includes('datos internos'), 'no se filtra el detalle interno');
    await assert.rejects(readFile(almacen.rutaMedio({ mediaId: 'IMG1', mimetype: 'image/jpeg' })));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('dos peticiones a la vez por la misma imagen hacen una sola consulta a Evolution', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    await almacen.guardarLote([fotoMsg()]);
    let llamadas = 0;
    const evolution = { recuperarMedia: async () => { llamadas++; await new Promise((r) => setTimeout(r, 30)); return { buffer: Buffer.from('x'), mimetype: 'image/jpeg' }; } };
    const h = crearRecuperacion({ almacen, vigilados, evolution, pausaMs: 0 });
    const [a, b] = await Promise.all([pedir(h, { chat: CHAT, id: 'IMG1' }), pedir(h, { chat: CHAT, id: 'IMG1' })]);
    assert.equal(a.estado, 200);
    assert.equal(b.estado, 200);
    assert.equal(llamadas, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('las recuperaciones de imágenes distintas van de una en una, para no saturar a WhatsApp', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    await almacen.guardarLote([fotoMsg(), fotoMsg({ id: 'IMG2', mediaId: 'IMG2' })]);
    let simultaneas = 0; let maximo = 0;
    const evolution = { recuperarMedia: async () => { simultaneas++; maximo = Math.max(maximo, simultaneas); await new Promise((r) => setTimeout(r, 20)); simultaneas--; return { buffer: Buffer.from('x'), mimetype: 'image/jpeg' }; } };
    const h = crearRecuperacion({ almacen, vigilados, evolution, pausaMs: 0 });
    await Promise.all([pedir(h, { chat: CHAT, id: 'IMG1' }), pedir(h, { chat: CHAT, id: 'IMG2' })]);
    assert.equal(maximo, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- router ----------

test('el router manda POST /medios/recuperar a su manejador, con Host permitido y JSON', async () => {
  const vistos = [];
  const enrutar = crearRouter({
    webhook: async () => ({ estado: 200, cuerpo: {} }),
    panel: async () => ({ estado: 200, html: 'panel' }),
    recuperar: async (p) => { vistos.push(p.cuerpo); return { estado: 200, cuerpo: { ok: true } }; },
    dirReportes: '/tmp/x',
    hosts: ['127.0.0.1:3100'],
  });
  const json = { host: '127.0.0.1:3100', 'content-type': 'application/json' };
  assert.equal((await enrutar({ metodo: 'POST', ruta: '/medios/recuperar', cabeceras: json, cuerpo: { a: 1 } })).estado, 200);
  assert.deepEqual(vistos, [{ a: 1 }]);
  assert.equal((await enrutar({ metodo: 'POST', ruta: '/medios/recuperar', cabeceras: { ...json, host: 'otro.example' }, cuerpo: {} })).estado, 403);
  assert.equal((await enrutar({ metodo: 'POST', ruta: '/medios/recuperar', cabeceras: { host: '127.0.0.1:3100', 'content-type': 'text/plain' }, cuerpo: {} })).estado, 415);
});

// ---------- conversación ----------

test('la conversación ofrece "Cargar imagen" cuando hay datos para pedirla y avisa sin botón cuando no', () => {
  const html = renderConversacion({
    nombre: 'X', chat: CHAT, desde: loc(2026, 10, 9), hasta: loc(2026, 10, 9, 23), total: 2, pagina: 1, totalPaginas: 1, version: '1',
    mensajes: [
      { ...fotoMsg(), recuperable: true },
      { ...fotoMsg({ id: 'IMG9', mediaId: 'IMG9', medio: undefined }) },
    ],
  });
  assert.match(html, /<li class="msg ajeno" data-tipo="imagen" data-msg="IMG1">/);
  assert.match(html, /<div class="sin-medio recuperable"[^>]*>[\s\S]*Imagen no guardada[\s\S]*<button type="button" class="cargar boton secundario">Cargar imagen<\/button>/);
  assert.equal((html.match(/class="cargar /g) || []).length, 1, 'solo la que se puede pedir lleva botón');
  assert.match(html, /<ol class="mensajes" id="lista" data-chat="120363000000000001@g\.us">/);
  assert.match(html, /fetch\('\/medios\/recuperar'/);
});

test('el manejador marca como recuperable lo que tiene datos de descarga y todavía no tiene archivo', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    await almacen.guardarLote([fotoMsg(), fotoMsg({ id: 'IMG2', mediaId: 'IMG2', fecha: loc(2026, 10, 9, 11) })]);
    await almacen.guardarMedio({ chat: CHAT, mediaId: 'IMG2', mimetype: 'image/jpeg', buffer: Buffer.from('ya está') });
    const manejar = crearConversacion({ almacen, vigilados, version: '1' });
    const { html } = await manejar({ ruta: `/conversacion?chat=${encodeURIComponent(CHAT)}&desde=2026-11-09&hasta=2026-11-09` });
    assert.match(html, /data-msg="IMG1"[\s\S]*?Cargar imagen/);
    assert.match(html, /<img src="\/medios\/IMG2"/, 'una imagen que ya se recuperó se muestra aunque venga del historial');
    assert.equal((html.match(/class="cargar /g) || []).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
