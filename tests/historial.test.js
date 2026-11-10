import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { crearManejador } from '../src/servidor.js';
import { parsearHistorial } from '../src/parse.js';
import { construirPrompt } from '../src/resumen.js';

const NUMERO = '5215511111111@s.whatsapp.net';
const OTRO = '5215522222222@s.whatsapp.net';
const LID = '111111111111111@lid';
const GRUPO = '120363000000000001@g.us';

// Mensaje tal como lo manda Evolution dentro de un lote messages.set (mismo formato que messages.upsert).
function msg({ id, jid = NUMERO, texto, audio, imagen, fromMe = false, ts = 1762000000, participant, alt, nombre = 'Cliente Uno' }) {
  const key = { remoteJid: jid, fromMe, id };
  if (participant) key.participant = participant;
  if (alt) key.remoteJidAlt = alt;
  const message = audio ? { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } }
    : imagen ? { imageMessage: { mimetype: 'image/jpeg', caption: imagen === true ? '' : imagen } }
    : { conversation: texto };
  return { key, pushName: nombre, message, messageTimestamp: ts, messageType: 'conversation' };
}
const lote = (...mensajes) => ({ event: 'messages.set', instance: 'resumen', data: mensajes });

async function montar(...vigilados) {
  const dir = await mkdtemp(join(tmpdir(), 'historial-'));
  const v = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  for (const j of vigilados) await v.activar(j);
  const almacen = new Almacen({ dir, vigilados: v });
  const manejar = crearManejador({ almacen, secreto: 'S', evolution: undefined });
  const enviar = (cuerpo, apikey = 'S') =>
    manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey }, cuerpo });
  return { dir, almacen, enviar };
}

// ---------- parseo ----------

test('parsearHistorial lee todos los mensajes del lote y marca audio e imagen como sin medio', () => {
  const r = parsearHistorial(lote(
    msg({ id: 'A', texto: 'hola' }),
    msg({ id: 'B', audio: true }),
    msg({ id: 'C', imagen: 'la factura' }),
    { key: { remoteJid: NUMERO, id: 'D' }, messageTimestamp: 1 }, // sin message: se descarta
  ));
  assert.deepEqual(r.map((m) => m.id), ['A', 'B', 'C']);
  assert.equal(r[0].tipo, 'texto');
  assert.equal('sinMedio' in r[0], false);
  assert.equal(r[1].tipo, 'audio');
  assert.equal(r[1].sinMedio, true);
  assert.equal('base64' in r[1], false);
  assert.equal(r[2].tipo, 'imagen');
  assert.equal(r[2].texto, 'la factura');
  assert.equal(r[2].sinMedio, true);
});

test('parsearHistorial conserva fecha, autor de grupo y quién escribió', () => {
  const [m] = parsearHistorial(lote(msg({ id: 'G', jid: GRUPO, texto: 'hola', participant: OTRO, nombre: 'Ana Beltrán', ts: 1762000000 })));
  assert.equal(m.chat, GRUPO);
  assert.equal(m.esGrupo, true);
  assert.equal(m.autor, OTRO);
  assert.equal(m.nombre, 'Ana Beltrán');
  assert.equal(m.fecha, new Date(1762000000 * 1000).toISOString());
});

test('parsearHistorial ignora otros eventos y formas inesperadas sin romperse', () => {
  assert.deepEqual(parsearHistorial(null), []);
  assert.deepEqual(parsearHistorial({ event: 'messages.upsert', data: [msg({ id: 'A', texto: 'x' })] }), []);
  assert.deepEqual(parsearHistorial({ event: 'messages.set', data: { no: 'es lista' } }), []);
  assert.deepEqual(parsearHistorial({ event: 'messages.set' }), []);
});

// ---------- almacén por lotes ----------

test('guardarLote guarda solo los chats vigilados, sin duplicar, y devuelve cuántos guardó', async () => {
  const { dir, almacen } = await montar(NUMERO);
  try {
    const mensajes = parsearHistorial(lote(
      msg({ id: '1', texto: 'uno', ts: 1762000001 }),
      msg({ id: '2', texto: 'dos', ts: 1762000002 }),
      msg({ id: '2', texto: 'dos repetido', ts: 1762000002 }),
      msg({ id: '3', jid: OTRO, texto: 'de otro chat', ts: 1762000003 }),
    ));
    assert.equal(await almacen.guardarLote(mensajes), 2);
    assert.deepEqual((await almacen.leer({ chat: NUMERO })).map((m) => m.texto), ['uno', 'dos']);
    assert.deepEqual(await almacen.leer({ chat: OTRO }), []);
    // Un segundo envío del mismo lote no agrega nada.
    assert.equal(await almacen.guardarLote(parsearHistorial(lote(msg({ id: '1', texto: 'uno' })))), 0);
    assert.equal((await almacen.leer({ chat: NUMERO })).length, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('guardarLote respeta lo que ya había y ordena por fecha al leer, aunque el historial sea más viejo', async () => {
  const { dir, almacen } = await montar(NUMERO);
  try {
    await almacen.guardar(parsearHistorial(lote(msg({ id: 'nuevo', texto: 'reciente', ts: 1762500000 })))[0]);
    await almacen.guardarLote(parsearHistorial(lote(msg({ id: 'viejo', texto: 'de hace días', ts: 1762000000 }))));
    assert.deepEqual((await almacen.leer({ chat: NUMERO })).map((m) => m.texto), ['de hace días', 'reciente']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('guardarLote resuelve el chat por el id alterno y guarda bajo el chat vigilado', async () => {
  const { dir, almacen } = await montar(NUMERO);
  try {
    const n = await almacen.guardarLote(parsearHistorial(lote(msg({ id: 'L', jid: LID, alt: NUMERO, texto: 'por lid' }))));
    assert.equal(n, 1);
    assert.equal((await almacen.leer({ chat: NUMERO }))[0].chat, NUMERO);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('guardarLote no escribe ningún archivo si ningún chat está vigilado', async () => {
  const { dir, almacen } = await montar();
  try {
    assert.equal(await almacen.guardarLote(parsearHistorial(lote(msg({ id: '1', texto: 'x' })))), 0);
    assert.deepEqual((await readdir(dir)).filter((f) => f !== 'vigilados.json'), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- webhook ----------

test('el webhook importa el lote messages.set de un chat vigilado y responde cuántos guardó', async () => {
  const { dir, almacen, enviar } = await montar(GRUPO);
  try {
    const r = await enviar(lote(
      msg({ id: 'h1', jid: GRUPO, texto: 'hola equipo', participant: OTRO, nombre: 'Ana', ts: 1762000001 }),
      msg({ id: 'h2', jid: NUMERO, texto: 'chat privado no vigilado' }),
    ));
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.guardados, 1);
    const [m] = await almacen.leer({ chat: GRUPO });
    assert.equal(m.texto, 'hola equipo');
    assert.equal(m.autor, OTRO);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el webhook rechaza un lote messages.set sin la apikey', async () => {
  const { dir, almacen, enviar } = await montar(NUMERO);
  try {
    const r = await enviar(lote(msg({ id: 'x', texto: 'secreto' })), 'MAL');
    assert.equal(r.estado, 401);
    assert.deepEqual(await almacen.leer({ chat: NUMERO }), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('un lote grande de chats no vigilados se descarta rápido y sin escribir nada', async () => {
  const { dir, enviar } = await montar(NUMERO);
  try {
    const muchos = Array.from({ length: 6000 }, (_, i) => msg({ id: `m${i}`, jid: `52155000${String(i % 500).padStart(5, '0')}@s.whatsapp.net`, texto: 'x' }));
    const t0 = Date.now();
    const r = await enviar(lote(...muchos));
    assert.equal(r.cuerpo.guardados, 0);
    assert.ok(Date.now() - t0 < 3000, 'debe tardar menos de 3 s');
    assert.deepEqual((await readdir(dir)).filter((f) => f !== 'vigilados.json'), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- prompt ----------

test('el prompt marca los audios e imágenes anteriores a la vigilancia como no disponibles', () => {
  const p = construirPrompt([
    { fecha: '2026-11-01T15:00:00.000Z', propio: false, tipo: 'audio', texto: null, sinMedio: true },
    { fecha: '2026-11-01T15:01:00.000Z', propio: false, tipo: 'imagen', texto: 'la factura', sinMedio: true },
  ]);
  assert.match(p, /\[audio anterior a la vigilancia: no disponible\]/);
  assert.match(p, /la factura \| \[imagen anterior a la vigilancia: no disponible\]/);
  assert.ok(!p.includes('[audio no procesado]'));
});

test('si el audio anterior a la vigilancia ya tiene transcripción, el prompt usa la transcripción y no el aviso', () => {
  const p = construirPrompt([{ fecha: '2026-11-01T15:00:00.000Z', propio: false, tipo: 'audio', texto: null, sinMedio: true, textoMedia: 'necesito la cotización' }]);
  assert.match(p, /necesito la cotización/);
  assert.ok(!p.includes('anterior a la vigilancia: no disponible'));
});
