import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { crearManejador } from '../src/servidor.js';
import { generarReporte } from '../src/reportar.js';

const CHAT = '5215511111111@s.whatsapp.net';

function evento(mensaje, id = 'AUD1') {
  return {
    event: 'messages.upsert',
    instance: 'resumen',
    data: {
      key: { remoteJid: CHAT, fromMe: false, id },
      pushName: 'Cliente',
      message: mensaje,
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}

function geminiFalso() {
  const fn = async (url, opts) => {
    fn.cuerpos.push(opts.body);
    const esAudio = opts.body.includes('inlineData');
    const texto = esAudio ? 'transcripcion de prueba' : '## Trabajo\n- listo';
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
  };
  fn.cuerpos = [];
  return fn;
}

async function montar(evolution) {
  const dir = await mkdtemp(join(tmpdir(), 'mime-'));
  const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  await vigilados.activar(CHAT);
  const almacen = new Almacen({ dir, vigilados });
  const manejar = crearManejador({ almacen, secreto: 'S', evolution });
  const enviar = (cuerpo) => manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo });
  const reportar = (extra = {}) => {
    const fetchFn = geminiFalso();
    return generarReporte({
      chat: CHAT, almacen, vigilados, medios: { apiKey: 'k', fetchFn, ...extra.medios }, dirReportes: join(dir, 'r'), ...extra,
    }).then((r) => ({ ...r, fetchFn }));
  };
  return { dir, almacen, enviar, reportar };
}

test('el mimetype parseado manda: se guarda como .ogg aunque Evolution diga otra cosa, y reportar lo lee', async () => {
  const evolution = { descargarMedia: async () => ({ buffer: Buffer.from('opus'), mimetype: 'audio/mp4' }) };
  const { dir, enviar, reportar } = await montar(evolution);
  try {
    await enviar(evento({ audioMessage: { mimetype: 'audio/ogg; codecs=opus' } }));
    assert.deepEqual(await readdir(join(dir, 'media')), ['AUD1.ogg']);
    const { fetchFn } = await reportar();
    assert.ok(fetchFn.cuerpos.some((b) => b.includes('inlineData')), 'el audio debe llegar a Gemini');
    assert.equal(await readFile(join(dir, 'media', 'AUD1.ogg.txt'), 'utf8'), 'transcripcion de prueba');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('sin mimetype parseado se usa el de Evolution al guardar y reportar igual lo encuentra', async () => {
  const evolution = { descargarMedia: async () => ({ buffer: Buffer.from('opus'), mimetype: 'audio/ogg' }) };
  const { dir, enviar, reportar } = await montar(evolution);
  try {
    await enviar(evento({ audioMessage: {} }));
    assert.deepEqual(await readdir(join(dir, 'media')), ['AUD1.ogg']);
    const { fetchFn } = await reportar();
    const envio = fetchFn.cuerpos.map((b) => JSON.parse(b)).find((b) => b.contents[0].parts.some((p) => p.inlineData));
    assert.ok(envio, 'el audio debe llegar a Gemini');
    assert.equal(envio.contents[0].parts.find((p) => p.inlineData).inlineData.mimeType, 'audio/ogg');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- descarga bajo demanda al generar el reporte ----------

async function conAudioSinArchivo(evolutionFn) {
  const evolution = { descargas: [], descargarMedia: async (...a) => { evolution.descargas.push(a); return evolutionFn(); } };
  const m = await montar(null); // el webhook no descarga: simula una descarga fallida
  await m.almacen.guardar({ id: 'AUD9', chat: CHAT, tipo: 'audio', texto: null, mediaId: 'AUD9', mimetype: 'audio/ogg; codecs=opus', fecha: new Date().toISOString(), propio: false });
  return { ...m, evolution };
}

test('archivo ausente: reportar lo descarga una vez con el mismo mediaId y lo procesa', async () => {
  const { dir, evolution, reportar } = await conAudioSinArchivo(async () => ({ buffer: Buffer.from('opus'), mimetype: 'audio/ogg' }));
  try {
    const { fetchFn } = await reportar({ evolution });
    assert.deepEqual(evolution.descargas, [['AUD9', CHAT]]);
    const envio = fetchFn.cuerpos.map((b) => JSON.parse(b)).find((b) => b.contents[0].parts.some((p) => p.inlineData));
    assert.ok(envio, 'Gemini debe recibir la peticion de transcripcion');
    assert.equal(await readFile(join(dir, 'media', 'AUD9.ogg'), 'utf8'), 'opus');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el resumen recibe la transcripcion del audio descargado bajo demanda', async () => {
  const { dir, evolution, reportar } = await conAudioSinArchivo(async () => ({ buffer: Buffer.from('opus'), mimetype: 'audio/ogg' }));
  try {
    const { fetchFn } = await reportar({ evolution });
    const resumen = fetchFn.cuerpos.map((b) => JSON.parse(b)).find((b) => b.generationConfig);
    assert.match(resumen.contents[0].parts[0].text, /contacto: transcripcion de prueba/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('si la descarga bajo demanda falla: "no se pudo procesar" y no se registra el error', async () => {
  const { dir, evolution, reportar } = await conAudioSinArchivo(async () => { throw new Error('boom http://evo/x?apikey=LLAVE123'); });
  const logs = [];
  const orig = { error: console.error, log: console.log, warn: console.warn };
  console.error = console.log = console.warn = (...a) => logs.push(a.join(' '));
  try {
    const { fetchFn } = await reportar({ evolution });
    const resumen = fetchFn.cuerpos.map((b) => JSON.parse(b)).find((b) => b.generationConfig);
    assert.match(resumen.contents[0].parts[0].text, /no se pudo procesar/);
    assert.equal(evolution.descargas.length, 1);
  } finally {
    Object.assign(console, orig);
    await rm(dir, { recursive: true, force: true });
  }
  assert.ok(!logs.join('\n').includes('LLAVE123'));
  assert.ok(!logs.join('\n').includes('boom'));
});

test('con transcripcion en cache no se descarga aunque falte el archivo', async () => {
  const { dir, almacen, evolution, reportar } = await conAudioSinArchivo(async () => ({ buffer: Buffer.from('x'), mimetype: 'audio/ogg' }));
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(dir, 'media'), { recursive: true });
    await writeFile(almacen.rutaMedio({ mediaId: 'AUD9', mimetype: 'audio/ogg' }) + '.txt', 'ya transcrito');
    await reportar({ evolution });
    assert.equal(evolution.descargas.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
