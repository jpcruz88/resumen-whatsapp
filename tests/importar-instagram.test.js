import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerExportacion, importar } from '../src/importar-instagram.js';
import { Almacen } from '../src/almacen.js';
import { TodosLosChats } from '../src/vigilados.js';

// Instagram guarda los textos como bytes UTF-8 leídos como latin1: "ñ" sale "Ã±".
const mojibake = (s) => Buffer.from(s, 'utf8').toString('latin1');
const T0 = 1_790_000_000_000;

async function hilo(raiz, carpeta, datos, archivo = 'message_1.json', sub = 'your_instagram_activity/messages/inbox') {
  const dir = join(raiz, sub, carpeta);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, archivo), JSON.stringify(datos));
}

async function exportacion(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'igexp-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

const directo = (otro, mensajes) => ({
  participants: [{ name: mojibake('Yo Prueba') }, { name: mojibake(otro) }],
  messages: mensajes, title: mojibake(otro), thread_path: 'inbox/x',
});

test('lee los hilos, arregla los acentos y detecta quién soy por ser el que está en todos', () => exportacion(async (raiz) => {
  await hilo(raiz, 'anaprueba_aaa1', directo('Ana Muñoz', [
    { sender_name: mojibake('Ana Muñoz'), timestamp_ms: T0 + 2000, content: mojibake('¿Nos vemos mañana?') },
    { sender_name: mojibake('Yo Prueba'), timestamp_ms: T0 + 1000, content: 'Hola Ana' },
  ]));
  await hilo(raiz, 'betoprueba_bbb2', directo('Beto Ríos', [{ sender_name: mojibake('Beto Ríos'), timestamp_ms: T0 + 3000, content: 'ok' }]));
  const r = await leerExportacion(raiz);
  assert.equal(r.yo, 'Yo Prueba');
  assert.equal(r.mensajes.length, 3);
  const ana = r.mensajes.filter((m) => m.chat === 'ig:anaprueba_aaa1').sort((a, b) => a.fecha.localeCompare(b.fecha));
  assert.deepEqual(ana.map((m) => [m.texto, m.propio, m.nombre]), [['Hola Ana', true, 'Yo'], ['¿Nos vemos mañana?', false, 'Ana Muñoz']]);
  assert.equal(ana[0].fecha, new Date(T0 + 1000).toISOString());
  assert.equal(ana[0].tipo, 'texto');
  assert.equal(r.nombres['ig:anaprueba_aaa1'], 'Ana Muñoz');
}));

test('junta message_1, message_2… del mismo hilo y las carpetas de solicitudes', () => exportacion(async (raiz) => {
  await hilo(raiz, 'ana_aaa1', directo('Ana', [{ sender_name: 'Ana', timestamp_ms: T0 + 1, content: 'uno' }]), 'message_1.json');
  await hilo(raiz, 'ana_aaa1', directo('Ana', [{ sender_name: 'Ana', timestamp_ms: T0 + 2, content: 'dos' }]), 'message_2.json');
  await hilo(raiz, 'carlos_ccc3', directo('Carlos', [{ sender_name: 'Carlos', timestamp_ms: T0 + 3, content: 'tres' }]), 'message_1.json', 'your_instagram_activity/messages/message_requests');
  const r = await leerExportacion(raiz);
  assert.deepEqual(r.mensajes.map((m) => m.texto).sort(), ['dos', 'tres', 'uno']);
}));

test('de enlaces compartidos toma el texto; ignora adjuntos, reacciones y avisos del sistema', () => exportacion(async (raiz) => {
  await hilo(raiz, 'ana_aaa1', directo('Ana', [
    { sender_name: 'Ana', timestamp_ms: T0 + 1, share: { link: 'https://ejemplo.test/x', share_text: 'mira este reel' } },
    { sender_name: 'Ana', timestamp_ms: T0 + 2, photos: [{ uri: 'a.jpg' }] },
    { sender_name: 'Ana', timestamp_ms: T0 + 3, audio_files: [{ uri: 'a.mp4' }] },
    { sender_name: 'Ana', timestamp_ms: T0 + 4, content: 'Ana sent an attachment.' },
    { sender_name: 'Ana', timestamp_ms: T0 + 5, content: 'Reacted ❤ to your message' },
    { sender_name: 'Ana', timestamp_ms: T0 + 6, content: 'Liked a message' },
    { sender_name: 'Ana', timestamp_ms: T0 + 7, content: 'texto bueno', reactions: [{ reaction: 'x', actor: 'Yo' }] },
  ]));
  const r = await leerExportacion(raiz);
  assert.deepEqual(r.mensajes.map((m) => m.texto), ['mira este reel', 'texto bueno']);
}));

test('con más de dos participantes es un grupo y cada mensaje lleva su autor', () => exportacion(async (raiz) => {
  await hilo(raiz, 'equipo_ggg4', {
    participants: [{ name: 'Yo Prueba' }, { name: 'Ana' }, { name: 'Beto' }], title: 'Equipo IG',
    messages: [{ sender_name: 'Ana', timestamp_ms: T0 + 1, content: 'hola equipo' }],
  });
  await hilo(raiz, 'ana_aaa1', directo('Ana', [{ sender_name: 'Ana', timestamp_ms: T0 + 2, content: 'x' }]));
  const r = await leerExportacion(raiz, { yo: 'Yo Prueba' });
  const g = r.mensajes.find((m) => m.chat === 'ig:equipo_ggg4');
  assert.equal(g.esGrupo, true);
  assert.equal(g.nombre, 'Ana');
  assert.equal(g.autor, 'ig:Ana');
  assert.equal(r.nombres['ig:equipo_ggg4'], 'Equipo IG');
}));

test('importar guarda en el almacén sin duplicar al repetirse, y escribe los nombres', () => exportacion(async (raiz) => {
  await hilo(raiz, 'ana_aaa1', directo('Ana', [
    { sender_name: 'Ana', timestamp_ms: T0 + 1, content: 'uno' },
    { sender_name: 'Yo Prueba', timestamp_ms: T0 + 2, content: 'dos' },
  ]));
  const datos = join(raiz, 'datos');
  const almacen = new Almacen({ dir: datos, vigilados: new TodosLosChats() });
  const a = await importar({ carpeta: raiz, almacen, dir: datos });
  assert.equal(a.nuevos, 2);
  const b = await importar({ carpeta: raiz, almacen, dir: datos });
  assert.equal(b.nuevos, 0);
  assert.equal((await almacen.resumenChats())[0].total, 2);
  assert.equal(JSON.parse(await readFile(join(datos, 'instagram-nombres.json'), 'utf8'))['ig:ana_aaa1'], 'Ana');
}));

test('sin hilos devuelve cero y no falla', () => exportacion(async (raiz) => {
  const r = await leerExportacion(raiz);
  assert.deepEqual(r.mensajes, []);
}));
