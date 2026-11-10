import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { crearManejador } from '../src/servidor.js';
import { parsearEventoEvolution } from '../src/parse.js';

const NUMERO = '5215511111111@s.whatsapp.net';
const LID = '111111111111111@lid';
const GRUPO = '120363000000000001@g.us';

function evento({ remoteJid, remoteJidAlt, id = 'AUD1', mensaje, extraKey = {} }) {
  const key = { remoteJid, fromMe: false, id, ...extraKey };
  if (remoteJidAlt !== undefined) key.remoteJidAlt = remoteJidAlt;
  return {
    event: 'messages.upsert',
    instance: 'resumen',
    data: {
      key,
      pushName: 'Cliente Uno',
      message: mensaje ?? {
        audioMessage: { mimetype: 'audio/ogg; codecs=opus' },
        base64: Buffer.from('bytes-del-audio').toString('base64'),
      },
      messageTimestamp: 1762646400,
    },
  };
}

async function montar(vigilado) {
  const dir = await mkdtemp(join(tmpdir(), 'alterno-'));
  const v = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  for (const j of [].concat(vigilado ?? [])) await v.activar(j);
  const almacen = new Almacen({ dir, vigilados: v });
  const manejar = crearManejador({ almacen, secreto: 'S', evolution: undefined });
  const enviar = (cuerpo) =>
    manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo });
  return { dir, almacen, enviar };
}

test('parsear devuelve chatAlt desde key.remoteJidAlt', () => {
  const m = parsearEventoEvolution(evento({ remoteJid: LID, remoteJidAlt: NUMERO }));
  assert.equal(m.chat, LID);
  assert.equal(m.chatAlt, NUMERO);
});

test('parsear devuelve chatAlt null si falta o si es un grupo', () => {
  assert.equal(parsearEventoEvolution(evento({ remoteJid: NUMERO })).chatAlt, null);
  assert.equal(parsearEventoEvolution(evento({ remoteJid: NUMERO, remoteJidAlt: GRUPO })).chatAlt, null);
  assert.equal(parsearEventoEvolution(evento({ remoteJid: NUMERO, remoteJidAlt: '' })).chatAlt, null);
});

test('resolverChat: el chat directo si está vigilado, luego el alterno, si no null', async () => {
  const { dir, almacen } = await montar(NUMERO);
  try {
    assert.equal(await almacen.resolverChat({ chat: NUMERO, chatAlt: LID }), NUMERO);
    assert.equal(await almacen.resolverChat({ chat: LID, chatAlt: NUMERO }), NUMERO);
    assert.equal(await almacen.resolverChat({ chat: LID, chatAlt: null }), null);
    assert.equal(await almacen.resolverChat({ chat: LID }), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('remoteJid lid con alt número y solo el número vigilado: guarda bajo el número, lee y guarda el audio', async () => {
  const { dir, almacen, enviar } = await montar(NUMERO);
  try {
    const r = await enviar(evento({ remoteJid: LID, remoteJidAlt: NUMERO }));
    assert.equal(r.estado, 200);
    const leidos = await almacen.leer({ chat: NUMERO });
    assert.equal(leidos.length, 1);
    assert.equal(leidos[0].chat, NUMERO);
    assert.equal(leidos[0].id, 'AUD1');
    assert.ok(!('chatAlt' in leidos[0]));
    assert.deepEqual(await almacen.leer({ chat: LID }), []);
    const hallado = await almacen.localizarMedio({ mediaId: 'AUD1', mimetype: leidos[0].mimetype });
    assert.ok(hallado);
    assert.deepEqual(await readFile(hallado.ruta), Buffer.from('bytes-del-audio'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('lo inverso: vigilado el lid y alt es el número, guarda bajo el lid', async () => {
  const { dir, almacen, enviar } = await montar(LID);
  try {
    await enviar(evento({ remoteJid: NUMERO, remoteJidAlt: LID }));
    const leidos = await almacen.leer({ chat: LID });
    assert.equal(leidos.length, 1);
    assert.equal(leidos[0].chat, LID);
    assert.deepEqual(await almacen.leer({ chat: NUMERO }), []);
    assert.ok(await almacen.localizarMedio({ mediaId: 'AUD1', mimetype: leidos[0].mimetype }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el descargarMedia de respaldo recibe el chat vigilado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alterno-'));
  try {
    const v = new Vigilados({ archivo: join(dir, 'vigilados.json') });
    await v.activar(NUMERO);
    const almacen = new Almacen({ dir, vigilados: v });
    const llamadas = [];
    const evolution = { async descargarMedia(id, chat) { llamadas.push([id, chat]); return { buffer: Buffer.from('x'), mimetype: 'audio/ogg' }; } };
    const manejar = crearManejador({ almacen, secreto: 'S', evolution });
    const ev = evento({ remoteJid: LID, remoteJidAlt: NUMERO, mensaje: { audioMessage: { mimetype: 'audio/ogg' } } });
    await manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo: ev });
    assert.deepEqual(llamadas, [['AUD1', NUMERO]]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ninguno vigilado: no escribe nada', async () => {
  const { dir, enviar } = await montar('5215599999999@s.whatsapp.net');
  try {
    const r = await enviar(evento({ remoteJid: LID, remoteJidAlt: NUMERO }));
    assert.equal(r.estado, 200);
    assert.deepEqual((await readdir(dir)).filter((f) => f !== 'vigilados.json'), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('un alt de grupo se ignora aunque el grupo esté vigilado', async () => {
  const { dir, almacen, enviar } = await montar(GRUPO);
  try {
    await enviar(evento({ remoteJid: LID, remoteJidAlt: GRUPO }));
    assert.deepEqual(await almacen.leer({ chat: GRUPO }), []);
    assert.deepEqual((await readdir(dir)).filter((f) => f !== 'vigilados.json'), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
