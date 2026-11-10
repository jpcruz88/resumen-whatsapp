import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsearEventoEvolution } from '../src/parse.js';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { construirPrompt, resumir } from '../src/resumen.js';
import { crearManejador } from '../src/servidor.js';

const CHAT_OK = '5215511111111@s.whatsapp.net';
const CHAT_NO = '5215522222222@s.whatsapp.net';

async function vigilando(dir, ...chats) {
  const v = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  for (const c of chats) await v.activar(c);
  return v;
}

function evento(jid, texto, { fromMe = false, ts = 1762646400, id = 'ID1' } = {}) {
  return {
    event: 'messages.upsert',
    instance: 'resumen',
    data: {
      key: { remoteJid: jid, fromMe, id },
      pushName: 'Cliente',
      message: { conversation: texto },
      messageTimestamp: ts,
      messageType: 'conversation',
    },
  };
}

// ---------- parse ----------

test('parsea un mensaje de texto de Evolution v2', () => {
  const m = parsearEventoEvolution(evento(CHAT_OK, 'hola, mandame la cotización'));
  assert.equal(m.chat, CHAT_OK);
  assert.equal(m.texto, 'hola, mandame la cotización');
  assert.equal(m.propio, false);
  assert.equal(m.id, 'ID1');
  assert.equal(m.fecha, new Date(1762646400 * 1000).toISOString());
});

test('parsea extendedTextMessage y marca fromMe', () => {
  const p = evento(CHAT_OK, '', { fromMe: true });
  p.data.message = { extendedTextMessage: { text: 'te lo mando mañana' } };
  const m = parsearEventoEvolution(p);
  assert.equal(m.texto, 'te lo mando mañana');
  assert.equal(m.propio, true);
});

test('ignora eventos que no son messages.upsert y mensajes sin texto', () => {
  assert.equal(parsearEventoEvolution({ event: 'connection.update', data: {} }), null);
  const sinTexto = evento(CHAT_OK, '');
  sinTexto.data.message = { videoMessage: { caption: '' } };
  assert.equal(parsearEventoEvolution(sinTexto), null);
});

test('parsea audio con mediaId y mimetype, sin texto', () => {
  const p = evento(CHAT_OK, '');
  p.data.message = { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } };
  const m = parsearEventoEvolution(p);
  assert.equal(m.tipo, 'audio');
  assert.equal(m.mediaId, 'ID1');
  assert.equal(m.mimetype, 'audio/ogg; codecs=opus');
  assert.equal(m.texto, null);
});

test('parsea imagen con caption como texto', () => {
  const p = evento(CHAT_OK, '');
  p.data.message = { imageMessage: { mimetype: 'image/jpeg', caption: 'factura' } };
  const m = parsearEventoEvolution(p);
  assert.equal(m.tipo, 'imagen');
  assert.equal(m.texto, 'factura');
  assert.equal(m.mediaId, 'ID1');
  assert.equal(m.mimetype, 'image/jpeg');
});

test('texto marca tipo texto; video y grupos devuelven null', () => {
  assert.equal(parsearEventoEvolution(evento(CHAT_OK, 'hola')).tipo, 'texto');
  const v = evento(CHAT_OK, '');
  v.data.message = { videoMessage: { mimetype: 'video/mp4' } };
  assert.equal(parsearEventoEvolution(v), null);
  assert.equal(parsearEventoEvolution(evento('120363000000@g.us', 'hola')), null);
});

// ---------- almacén ----------

test('guarda solo chats permitidos y filtra por periodo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resumen-'));
  try {
    const almacen = new Almacen({ dir, vigilados: await vigilando(dir, CHAT_OK) });
    await almacen.guardar(parsearEventoEvolution(evento(CHAT_OK, 'viejo', { ts: 1000, id: 'a' })));
    await almacen.guardar(parsearEventoEvolution(evento(CHAT_OK, 'nuevo', { ts: 2000000000, id: 'b' })));
    await almacen.guardar(parsearEventoEvolution(evento(CHAT_NO, 'ajeno', { id: 'c' })));

    const todos = await almacen.leer({ chat: CHAT_OK });
    assert.deepEqual(todos.map((m) => m.texto), ['viejo', 'nuevo']);

    const periodo = await almacen.leer({
      chat: CHAT_OK,
      desde: new Date(1500 * 1000).toISOString(),
      hasta: new Date(3000000000 * 1000).toISOString(),
    });
    assert.deepEqual(periodo.map((m) => m.texto), ['nuevo']);

    const ajeno = await almacen.leer({ chat: CHAT_NO });
    assert.equal(ajeno.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('no duplica un mensaje con el mismo id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resumen-'));
  try {
    const almacen = new Almacen({ dir, vigilados: await vigilando(dir, CHAT_OK) });
    const m = parsearEventoEvolution(evento(CHAT_OK, 'uno', { id: 'dup' }));
    await almacen.guardar(m);
    await almacen.guardar(m);
    assert.equal((await almacen.leer({ chat: CHAT_OK })).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- resumen ----------

test('el prompt incluye los mensajes y pide separar trabajo y personal', () => {
  const p = construirPrompt([
    { fecha: '2026-11-08T10:00:00.000Z', propio: false, texto: 'ocupo 50 copias para el lunes' },
    { fecha: '2026-11-08T10:01:00.000Z', propio: true, texto: 'listo, te las tengo' },
  ]);
  assert.match(p, /ocupo 50 copias para el lunes/);
  assert.match(p, /yo: listo, te las tengo/i);
  assert.match(p, /Trabajo/);
  assert.match(p, /Personal/);
  assert.match(p, /Tareas/);
});

test('el prompt usa la transcripcion del audio y la descripcion de la imagen', () => {
  const p = construirPrompt([
    { fecha: 'f1', propio: false, tipo: 'audio', texto: null, textoMedia: 'ocupo la factura del lunes' },
    { fecha: 'f2', propio: false, tipo: 'imagen', texto: null, textoMedia: 'foto de un recibo por 500 pesos' },
  ]);
  assert.match(p, /contacto: ocupo la factura del lunes/);
  assert.match(p, /contacto: foto de un recibo por 500 pesos/);
  assert.doesNotMatch(p, /null/);
});

test('un audio sin textoMedia aparece como no procesado', () => {
  const p = construirPrompt([{ fecha: 'f1', propio: true, tipo: 'audio', texto: null }]);
  assert.match(p, /yo: \[audio no procesado\]/);
  assert.doesNotMatch(p, /null/);
});

test('el prompt pide las dos categorias y la lista de tareas con fecha', () => {
  const p = construirPrompt([{ fecha: 'f', propio: false, tipo: 'texto', texto: 'hola' }]);
  assert.match(p, /## Trabajo/);
  assert.match(p, /## Personal/);
  assert.match(p, /### Tareas que me pidieron/);
  assert.match(p, /fecha/i);
});

test('resumir llama a Gemini con la clave y devuelve el texto', async () => {
  let pedido;
  const fetchFalso = async (url, opts) => {
    pedido = { url, opts, body: JSON.parse(opts.body) };
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: '## Trabajo\n- Entregar 50 copias' }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const texto = await resumir({
    mensajes: [{ fecha: 'x', propio: false, texto: 'ocupo 50 copias' }],
    apiKey: 'CLAVE_PRUEBA',
    model: 'gemini-test',
    fetchFn: fetchFalso,
  });
  assert.equal(texto, '## Trabajo\n- Entregar 50 copias');
  assert.match(pedido.url, /models\/gemini-test:generateContent/);
  assert.equal(pedido.opts.headers['x-goog-api-key'], 'CLAVE_PRUEBA');
  assert.doesNotMatch(pedido.url, /CLAVE_PRUEBA|key=/);
  assert.match(pedido.body.contents[0].parts[0].text, /ocupo 50 copias/);
});

test('resumir sin mensajes no llama al modelo', async () => {
  let llamado = false;
  const texto = await resumir({ mensajes: [], apiKey: 'k', fetchFn: async () => { llamado = true; } });
  assert.equal(llamado, false);
  assert.match(texto, /No hay mensajes/);
});

// ---------- servidor ----------

test('webhook guarda el mensaje cuando el secreto es correcto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resumen-'));
  try {
    const almacen = new Almacen({ dir, vigilados: await vigilando(dir, CHAT_OK) });
    const manejar = crearManejador({ almacen, secreto: 'S3CRETO' });
    const r = await manejar({
      metodo: 'POST',
      ruta: '/webhook/evolution',
      cabeceras: { apikey: 'S3CRETO' },
      cuerpo: evento(CHAT_OK, 'hola'),
    });
    assert.equal(r.estado, 200);
    assert.equal((await almacen.leer({ chat: CHAT_OK })).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('webhook rechaza un secreto incorrecto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resumen-'));
  try {
    const almacen = new Almacen({ dir, vigilados: await vigilando(dir, CHAT_OK) });
    const manejar = crearManejador({ almacen, secreto: 'S3CRETO' });
    const r = await manejar({
      metodo: 'POST',
      ruta: '/webhook/evolution',
      cabeceras: { apikey: 'MAL' },
      cuerpo: evento(CHAT_OK, 'hola'),
    });
    assert.equal(r.estado, 401);
    assert.equal((await almacen.leer({ chat: CHAT_OK })).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- fecha y hora locales en el prompt ----------

test('el prompt muestra cada mensaje con [AAAA-MM-DD HH:MM] en hora local', () => {
  const utc = new Date('2026-11-08T10:05:00.000Z');
  const pad = (n) => String(n).padStart(2, '0');
  const esperado = `[${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())} ${pad(utc.getHours())}:${pad(utc.getMinutes())}]`;
  const p = construirPrompt([{ fecha: utc.toISOString(), propio: false, tipo: 'texto', texto: 'hola' }]);
  assert.ok(p.includes(`${esperado} contacto: hola`), p);
  assert.ok(!p.includes('2026-11-08T10:05'), 'no debe quedar el ISO UTC');
});

test('un mensaje a las 23:30 locales conserva su dia local, no el UTC', () => {
  const local = new Date(2026, 10, 9, 23, 30);
  const p = construirPrompt([{ fecha: local.toISOString(), propio: true, tipo: 'texto', texto: 'x' }]);
  assert.ok(p.includes('[2026-11-09 23:30] yo: x'), p);
});

test('las instrucciones exigen citar fecha y hora en la misma forma y ya no dicen "fecha si aparece"', () => {
  const p = construirPrompt([{ fecha: new Date().toISOString(), propio: false, tipo: 'texto', texto: 'hola' }]);
  assert.match(p, /\[AAAA-MM-DD HH:MM\]/);
  assert.doesNotMatch(p, /fecha si aparece/i);
});
