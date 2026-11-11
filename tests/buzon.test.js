import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { crearManejador } from '../src/servidor.js';
import { crearPanel } from '../src/panel.js';
import { parsearHistorial } from '../src/parse.js';

const NUMERO = '5215511111111@s.whatsapp.net';
const OTRO = '5215522222222@s.whatsapp.net';
const LID = '111111111111111@lid';
const AHORA = Date.parse('2026-11-11T20:00:00Z');
const ts = (iso) => Math.floor(Date.parse(iso) / 1000);

function msg({ id, jid = OTRO, texto, audio, imagen, ts: t = ts('2026-11-10T12:00:00Z'), alt, fromMe = false }) {
  const key = { remoteJid: jid, fromMe, id };
  if (alt) key.remoteJidAlt = alt;
  const llave = { mediaKey: 'AQID', directPath: '/v/t62/x', fileLength: 10 };
  const message = audio ? { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ...llave } }
    : imagen ? { imageMessage: { mimetype: 'image/jpeg', caption: imagen === true ? '' : imagen, ...llave } }
    : { conversation: texto };
  return { key, pushName: 'Persona', message, messageTimestamp: t };
}
const lote = (...ms) => ({ event: 'messages.set', instance: 'resumen', data: ms });
const upsert = (m) => ({ event: 'messages.upsert', instance: 'resumen', data: m });

async function montar() {
  const dir = await mkdtemp(join(tmpdir(), 'buzon-'));
  const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  const almacen = new Almacen({ dir, vigilados });
  const manejar = crearManejador({ almacen, secreto: 'S', evolution: undefined });
  const enviar = (cuerpo) => manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo });
  return { dir, vigilados, almacen, enviar };
}
const limpiar = (dir) => rm(dir, { recursive: true, force: true });

test('el historial de un chat no vigilado se guarda aparte y no se puede leer mientras no se vigile', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    const r = await enviar(lote(msg({ id: 'a', texto: 'hola' }), msg({ id: 'b', texto: 'qué tal' })));
    assert.equal(r.cuerpo.guardados, 0);
    assert.deepEqual(await almacen.leer({ chat: OTRO }), []);
    await vigilados.activar(OTRO);
    assert.deepEqual(await almacen.leer({ chat: OTRO }), []);
    assert.deepEqual((await readdir(join(dir, 'buzon'))).length, 1);
  } finally { await limpiar(dir); }
});

test('al vigilar un chat se recupera todo lo que ya había llegado, con audios e imágenes por cargar', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    await enviar(lote(
      msg({ id: 'a', texto: 'primero', ts: ts('2026-10-01T12:00:00Z') }),
      msg({ id: 'b', audio: true, ts: ts('2026-10-02T12:00:00Z') }),
      msg({ id: 'c', imagen: 'la factura', ts: ts('2026-10-03T12:00:00Z') }),
    ));
    await vigilados.activar(OTRO);
    const n = await almacen.promover(OTRO);
    assert.equal(n, 3);
    const ms = await almacen.leer({ chat: OTRO });
    assert.deepEqual(ms.map((m) => m.id), ['a', 'b', 'c']);
    assert.equal(ms[1].sinMedio, true);
    assert.ok(ms[1].medio?.mediaKey, 'conserva los datos para pedir el archivo');
    assert.equal(ms[2].texto, 'la factura');
    assert.deepEqual(await readdir(join(dir, 'buzon')), []);
    assert.equal(await almacen.promover(OTRO), 0, 'repetirlo no duplica');
    assert.equal((await almacen.leer({ chat: OTRO })).length, 3);
  } finally { await limpiar(dir); }
});

test('un mensaje en vivo de un chat no vigilado entra al buzón y su archivo se descarga al llegar', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    const m = msg({ id: 'v1', imagen: 'foto', ts: ts('2026-11-11T10:00:00Z') });
    m.message.base64 = Buffer.from('JPEGDATA').toString('base64');
    const r = await enviar(upsert(m));
    assert.equal(r.estado, 200);
    await vigilados.activar(OTRO);
    await almacen.promover(OTRO);
    const [guardado] = await almacen.leer({ chat: OTRO });
    assert.equal(guardado.id, 'v1');
    assert.equal(guardado.sinMedio, true);
    assert.equal('base64' in guardado, false);
    assert.equal(JSON.stringify(guardado).includes('JPEGDATA'), false, 'el base64 no entra al JSONL');
    const hallado = await almacen.localizarMedio({ mediaId: guardado.mediaId, mimetype: guardado.mimetype });
    assert.ok(hallado, 'el archivo quedó guardado desde que llegó');
    assert.equal((await readFile(hallado.ruta)).toString(), 'JPEGDATA');
  } finally { await limpiar(dir); }
});

test('el buzón junta las dos formas del id de la persona (@lid y número)', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    await enviar(lote(msg({ id: 'x1', jid: LID, alt: NUMERO, texto: 'por lid' }), msg({ id: 'x2', jid: NUMERO, texto: 'por número', ts: ts('2026-11-10T13:00:00Z') })));
    await vigilados.activar(NUMERO);
    assert.equal(await almacen.promover(NUMERO), 2);
    assert.deepEqual((await almacen.leer({ chat: NUMERO })).map((m) => m.texto), ['por lid', 'por número']);
    assert.ok((await almacen.leer({ chat: NUMERO })).every((m) => m.chat === NUMERO));
  } finally { await limpiar(dir); }
});

test('promover no pisa lo que ya estaba guardado y los otros chats siguen en el buzón', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    await vigilados.activar(OTRO);
    await enviar(lote(msg({ id: 'ya', texto: 'ya vigilado' })));
    await enviar(lote(msg({ id: 'otro', jid: NUMERO, texto: 'de otro chat' })));
    assert.equal(await almacen.promover(OTRO), 0);
    assert.equal((await almacen.leer({ chat: OTRO })).length, 1);
    await vigilados.activar(NUMERO);
    assert.equal(await almacen.promover(NUMERO), 1);
  } finally { await limpiar(dir); }
});

test('al promover, "vigilado desde" retrocede a la fecha del primer mensaje recuperado', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    await enviar(lote(msg({ id: 'a', texto: 'viejo', ts: ts('2026-09-01T12:00:00Z') })));
    await vigilados.activar(OTRO);
    await almacen.promover(OTRO);
    assert.equal(await vigilados.desdeDe(OTRO), '2026-09-01T12:00:00.000Z');
  } finally { await limpiar(dir); }
});

test('el buzón ignora estados, difusiones y canales', async () => {
  const { dir, enviar } = await montar();
  try {
    await enviar(lote(
      msg({ id: 's', jid: 'status@broadcast', texto: 'estado' }),
      msg({ id: 'n', jid: '120363000000000009@newsletter', texto: 'canal' }),
      msg({ id: 'l', jid: '1234@broadcast', texto: 'difusión' }),
    ));
    assert.deepEqual(await readdir(dir).then((f) => f.filter((x) => x === 'buzon')), []);
  } finally { await limpiar(dir); }
});

test('limpiarBuzon borra lo más viejo que el plazo y los archivos que quedan vacíos', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    await enviar(lote(
      msg({ id: 'viejo', texto: 'muy viejo', ts: ts('2026-05-01T12:00:00Z') }),
      msg({ id: 'nuevo', texto: 'reciente', ts: ts('2026-11-10T12:00:00Z') }),
      msg({ id: 'solo-viejo', jid: NUMERO, texto: 'viejo también', ts: ts('2026-04-01T12:00:00Z') }),
    ));
    const r = await almacen.limpiarBuzon({ dias: 120, ahora: AHORA });
    assert.equal(r.borrados, 2);
    assert.equal((await readdir(join(dir, 'buzon'))).length, 1);
    await vigilados.activar(OTRO);
    await almacen.promover(OTRO);
    assert.deepEqual((await almacen.leer({ chat: OTRO })).map((m) => m.id), ['nuevo']);
  } finally { await limpiar(dir); }
});

test('el panel, al vigilar un chat, recupera su buzón y lo avisa', async () => {
  const { dir, almacen, vigilados, enviar } = await montar();
  try {
    await enviar(lote(msg({ id: 'p1', texto: 'antes de vigilar' })));
    const panel = crearPanel({ vigilados, almacen, evolution: { listarChats: async () => [] }, generar: async () => ({ url: '/x' }) });
    const r = await panel({ metodo: 'POST', ruta: '/vigilar', cuerpo: { chat: OTRO, activo: true } });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.recuperados, 1);
    assert.equal((await almacen.leer({ chat: OTRO }))[0].texto, 'antes de vigilar');
  } finally { await limpiar(dir); }
});

test('parsearHistorial sigue marcando sin medio y el buzón no cambia lo que se lee de chats no vigilados', async () => {
  const { dir, almacen } = await montar();
  try {
    const ms = parsearHistorial(lote(msg({ id: 'q', audio: true })));
    assert.equal(ms[0].sinMedio, true);
    assert.deepEqual(await almacen.leer({ chat: OTRO }), []);
    assert.equal(await almacen.buscarMensaje({ chat: OTRO, id: 'q' }), null);
  } finally { await limpiar(dir); }
});

test('el audio en vivo de un chat no vigilado también se descarga, y si no viene en el payload se pide a Evolution', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'buzon-'));
  try {
    const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
    const almacen = new Almacen({ dir, vigilados });
    const pedidos = [];
    const evolution = { descargarMedia: async (id, chat) => { pedidos.push([id, chat]); return { buffer: Buffer.from('OGGDATA'), mimetype: 'audio/ogg' }; } };
    const manejar = crearManejador({ almacen, secreto: 'S', evolution });
    const r = await manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo: upsert(msg({ id: 'aud1', audio: true, ts: ts('2026-11-11T11:00:00Z') })) });
    assert.equal(r.estado, 200);
    assert.deepEqual(pedidos, [['aud1', OTRO]]);
    const hallado = await almacen.localizarMedio({ mediaId: 'aud1', mimetype: 'audio/ogg; codecs=opus' });
    assert.ok(hallado);
  } finally { await limpiar(dir); }
});

test('los archivos del buzón no se pueden leer por la conversación mientras el chat no se vigile', async () => {
  const { dir, almacen, enviar } = await montar();
  try {
    const m = msg({ id: 'priv', imagen: true });
    m.message.base64 = Buffer.from('X').toString('base64');
    await enviar(upsert(m));
    assert.equal(await almacen.buscarMensaje({ chat: OTRO, id: 'priv' }), null);
    assert.deepEqual(await almacen.leer({ chat: OTRO }), []);
  } finally { await limpiar(dir); }
});
