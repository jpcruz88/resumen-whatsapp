import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { crearManejador } from '../src/servidor.js';

const CHAT_OK = '5215511111111@s.whatsapp.net';
const CHAT_NO = '5215522222222@s.whatsapp.net';

function eventoAudio(jid, id = 'AUD1') {
  return {
    event: 'messages.upsert',
    instance: 'resumen',
    data: {
      key: { remoteJid: jid, fromMe: false, id },
      pushName: 'Cliente',
      message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } },
      messageTimestamp: 1762646400,
      messageType: 'audioMessage',
    },
  };
}

function eventoTexto(jid, id = 'TXT1') {
  return {
    event: 'messages.upsert',
    instance: 'resumen',
    data: {
      key: { remoteJid: jid, fromMe: false, id },
      pushName: 'Cliente',
      message: { conversation: 'hola' },
      messageTimestamp: 1762646400,
      messageType: 'conversation',
    },
  };
}

async function montar(evolution) {
  const dir = await mkdtemp(join(tmpdir(), 'resumen-'));
  const v = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  await v.activar(CHAT_OK);
  const almacen = new Almacen({ dir, vigilados: v });
  const manejar = crearManejador({ almacen, secreto: 'S', evolution });
  const enviar = (cuerpo) =>
    manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo });
  return { dir, almacen, enviar };
}

function falso() {
  const llamadas = [];
  return {
    llamadas,
    async descargarMedia(mediaId, chat) {
      llamadas.push([mediaId, chat]);
      return { buffer: Buffer.from('datos'), mimetype: 'audio/ogg' };
    },
  };
}

test('audio de chat vigilado: descarga y guarda el archivo', async () => {
  const evo = falso();
  const { dir, enviar } = await montar(evo);
  try {
    const r = await enviar(eventoAudio(CHAT_OK));
    assert.equal(r.estado, 200);
    assert.deepEqual(evo.llamadas, [['AUD1', CHAT_OK]]);
    const archivos = await readdir(join(dir, 'media'));
    assert.equal(archivos.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audio de chat no vigilado: no descarga', async () => {
  const evo = falso();
  const { dir, enviar } = await montar(evo);
  try {
    const r = await enviar(eventoAudio(CHAT_NO));
    assert.equal(r.estado, 200);
    assert.equal(evo.llamadas.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audio duplicado: descarga una sola vez', async () => {
  const evo = falso();
  const { dir, enviar } = await montar(evo);
  try {
    await enviar(eventoAudio(CHAT_OK));
    await enviar(eventoAudio(CHAT_OK));
    assert.equal(evo.llamadas.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('descarga fallida: responde 200, conserva el mensaje y no registra el error', async () => {
  const evo = {
    async descargarMedia() {
      throw new Error('fallo http://evo/secreto?apikey=LLAVE123');
    },
  };
  const { dir, almacen, enviar } = await montar(evo);
  const logs = [];
  const orig = { error: console.error, log: console.log, warn: console.warn };
  console.error = console.log = console.warn = (...a) => logs.push(a.join(' '));
  try {
    const r = await enviar(eventoAudio(CHAT_OK));
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { ok: true });
  } finally {
    Object.assign(console, orig);
  }
  try {
    assert.equal((await almacen.leer({ chat: CHAT_OK })).length, 1);
    assert.ok(!logs.join('\n').includes('LLAVE123'));
    assert.ok(!logs.join('\n').includes('secreto'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mensaje de texto: no descarga', async () => {
  const evo = falso();
  const { dir, enviar } = await montar(evo);
  try {
    await enviar(eventoTexto(CHAT_OK));
    assert.equal(evo.llamadas.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
