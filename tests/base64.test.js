import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsearEventoEvolution } from '../src/parse.js';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';

const CHAT = '5215511111111@s.whatsapp.net';
const B64 = Buffer.from('contenido-secreto-del-audio').toString('base64');

function evento(message, extraData = {}) {
  return {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: CHAT, fromMe: false, id: 'M1' },
      pushName: 'Cliente',
      message,
      messageTimestamp: 1762646400,
      ...extraData,
    },
  };
}

test('audio con base64 en data.message.base64: el mensaje parseado lo trae', () => {
  const m = parsearEventoEvolution(
    evento({ audioMessage: { mimetype: 'audio/ogg' }, base64: B64 }),
  );
  assert.equal(m.tipo, 'audio');
  assert.equal(m.base64, B64);
});

test('imagen con base64 en data.base64: el mensaje parseado lo trae', () => {
  const m = parsearEventoEvolution(
    evento({ imageMessage: { mimetype: 'image/jpeg' } }, { base64: B64 }),
  );
  assert.equal(m.tipo, 'imagen');
  assert.equal(m.base64, B64);
});

test('audio sin base64: el campo es null', () => {
  const m = parsearEventoEvolution(evento({ audioMessage: { mimetype: 'audio/ogg' } }));
  assert.equal(m.base64, null);
});

test('el texto no lleva base64', () => {
  const m = parsearEventoEvolution(evento({ conversation: 'hola' }, { base64: B64 }));
  assert.equal(m.base64, undefined);
});

test('almacen.guardar no escribe el base64 en el JSONL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resumen-'));
  try {
    const v = new Vigilados({ archivo: join(dir, 'vigilados.json') });
    await v.activar(CHAT);
    const almacen = new Almacen({ dir, vigilados: v });
    const m = parsearEventoEvolution(
      evento({ audioMessage: { mimetype: 'audio/ogg' }, base64: B64 }),
    );
    assert.equal(await almacen.guardar(m), true);
    const archivos = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'));
    assert.equal(archivos.length, 1);
    const linea = await readFile(join(dir, archivos[0]), 'utf8');
    assert.ok(!linea.includes(B64));
    assert.ok(!linea.includes('base64'));
    assert.equal(JSON.parse(linea).id, 'M1');
    assert.equal(m.base64, B64, 'el objeto original conserva el base64 para el webhook');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
