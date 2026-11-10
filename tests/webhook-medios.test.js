import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
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

test('audio con base64 en el payload: guarda esos bytes y no descarga', async () => {
  const evo = falso();
  const { dir, enviar } = await montar(evo);
  try {
    const ev = eventoAudio(CHAT_OK);
    ev.data.message.base64 = Buffer.from('bytes-del-audio').toString('base64');
    const r = await enviar(ev);
    assert.equal(r.estado, 200);
    assert.equal(evo.llamadas.length, 0);
    const archivos = await readdir(join(dir, 'media'));
    assert.equal(archivos.length, 1);
    assert.deepEqual(await readFile(join(dir, 'media', archivos[0])), Buffer.from('bytes-del-audio'));
    assert.equal(archivos[0], 'AUD1.ogg');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('imagen con base64 en data.base64: guarda esos bytes y no descarga', async () => {
  const evo = falso();
  const { dir, enviar } = await montar(evo);
  try {
    const ev = eventoAudio(CHAT_OK, 'IMG1');
    ev.data.message = { imageMessage: { mimetype: 'image/jpeg' } };
    ev.data.base64 = Buffer.from('bytes-de-imagen').toString('base64');
    await enviar(ev);
    assert.equal(evo.llamadas.length, 0);
    assert.deepEqual(await readFile(join(dir, 'media', 'IMG1.jpg')), Buffer.from('bytes-de-imagen'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('base64 en un chat no vigilado: no guarda nada', async () => {
  const evo = falso();
  const { dir, enviar } = await montar(evo);
  try {
    const ev = eventoAudio(CHAT_NO);
    ev.data.message.base64 = Buffer.from('x').toString('base64');
    await enviar(ev);
    await assert.rejects(readdir(join(dir, 'media')));
    assert.equal(evo.llamadas.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('base64 sin cliente Evolution: igual guarda el medio', async () => {
  const { dir, enviar } = await montar(undefined);
  try {
    const ev = eventoAudio(CHAT_OK);
    ev.data.message.base64 = Buffer.from('sin-evolution').toString('base64');
    await enviar(ev);
    assert.deepEqual(await readFile(join(dir, 'media', 'AUD1.ogg')), Buffer.from('sin-evolution'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fallo al guardar el medio con base64: responde 200 y no registra el contenido', async () => {
  const evo = falso();
  const { dir, almacen, enviar } = await montar(evo);
  almacen.guardarMedio = async () => {
    throw new Error('fallo con ' + Buffer.from('contenido-privado').toString('base64'));
  };
  const logs = [];
  const orig = { error: console.error, log: console.log, warn: console.warn };
  console.error = console.log = console.warn = (...a) => logs.push(a.join(' '));
  try {
    const ev = eventoAudio(CHAT_OK);
    ev.data.message.base64 = Buffer.from('contenido-privado').toString('base64');
    const r = await enviar(ev);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { ok: true });
  } finally {
    Object.assign(console, orig);
  }
  try {
    assert.equal(evo.llamadas.length, 0);
    assert.ok(logs.join('\n').includes('AUD1'));
    assert.ok(!logs.join('\n').includes(Buffer.from('contenido-privado').toString('base64')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
