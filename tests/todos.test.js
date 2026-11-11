import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { TodosLosChats } from '../src/vigilados.js';
import { crearManejador } from '../src/servidor.js';

const NUMERO = '5215511111111@s.whatsapp.net';
const OTRO = '5215522222222@s.whatsapp.net';
const LID = '111111111111111@lid';
const GRUPO = '120363000000000001@g.us';
const ts = (iso) => Math.floor(Date.parse(iso) / 1000);

function msg({ id, jid = OTRO, texto, audio, imagen, t = ts('2026-11-10T12:00:00Z'), alt, fromMe = false }) {
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
  const dir = await mkdtemp(join(tmpdir(), 'todos-'));
  const almacen = new Almacen({ dir, vigilados: new TodosLosChats() });
  const manejar = crearManejador({ almacen, secreto: 'S', evolution: undefined });
  const enviar = (cuerpo) => manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo });
  return { dir, almacen, enviar };
}
const limpiar = (dir) => rm(dir, { recursive: true, force: true });

test('sin lista de vigilados, todo chat que llega se guarda completo y se puede leer', async () => {
  const { dir, almacen, enviar } = await montar();
  try {
    await enviar(upsert(msg({ id: 'a', texto: 'hola' })));
    const r = await enviar(lote(msg({ id: 'b', jid: GRUPO, texto: 'del grupo' }), msg({ id: 'c', texto: 'otro' })));
    assert.equal(r.cuerpo.guardados, 2);
    assert.deepEqual((await almacen.leer({ chat: OTRO })).map((m) => m.id), ['a', 'c']);
    assert.equal((await almacen.leer({ chat: GRUPO })).length, 1);
    assert.equal((await readdir(dir)).includes('buzon'), false, 'ya no hay buzón aparte');
  } finally { await limpiar(dir); }
});

test('los archivos de cualquier chat se descargan al llegar y quedan ligados a su mensaje', async () => {
  const { dir, almacen, enviar } = await montar();
  try {
    const m = msg({ id: 'img1', imagen: 'foto' });
    m.message.base64 = Buffer.from('JPEG').toString('base64');
    await enviar(upsert(m));
    const [g] = await almacen.leer({ chat: OTRO });
    assert.ok(await almacen.localizarMedio({ mediaId: g.mediaId, mimetype: g.mimetype }));
    assert.equal(await almacen.buscarMensaje({ chat: OTRO, id: 'img1' }).then((x) => x.id), 'img1');
  } finally { await limpiar(dir); }
});

test('una persona que llega como @lid y como número es un solo chat', async () => {
  const { dir, almacen, enviar } = await montar();
  try {
    await enviar(lote(msg({ id: 'x1', jid: LID, alt: NUMERO, texto: 'por lid', t: ts('2026-11-10T10:00:00Z') })));
    await enviar(upsert(msg({ id: 'x2', jid: NUMERO, texto: 'por número', t: ts('2026-11-10T11:00:00Z') })));
    await enviar(upsert(msg({ id: 'x3', jid: LID, texto: 'otra vez lid sin alterno', t: ts('2026-11-10T12:00:00Z') })));
    for (const chat of [NUMERO, LID]) {
      assert.deepEqual((await almacen.leer({ chat })).map((m) => m.id), ['x1', 'x2', 'x3'], `leer ${chat}`);
    }
    const lista = await almacen.resumenChats();
    assert.equal(lista.filter((c) => c.total === 3).length, 1);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].chat, NUMERO);
  } finally { await limpiar(dir); }
});

test('resumenChats lista cada chat con total, primer y último mensaje, más reciente primero', async () => {
  const { dir, almacen, enviar } = await montar();
  try {
    await enviar(lote(
      msg({ id: '1', jid: OTRO, texto: 'a', t: ts('2026-10-01T10:00:00Z') }),
      msg({ id: '2', jid: OTRO, texto: 'b', t: ts('2026-10-05T10:00:00Z') }),
      msg({ id: '3', jid: GRUPO, texto: 'c', t: ts('2026-11-09T10:00:00Z') }),
    ));
    const lista = await almacen.resumenChats();
    assert.deepEqual(lista.map((c) => c.chat), [GRUPO, OTRO]);
    assert.equal(lista[1].total, 2);
    assert.equal(lista[1].primero, '2026-10-01T10:00:00.000Z');
    assert.equal(lista[1].ultimo, '2026-10-05T10:00:00.000Z');
    assert.equal(lista[0].esGrupo, true);
  } finally { await limpiar(dir); }
});

test('estados, difusiones y canales no son chats', async () => {
  const { dir, almacen, enviar } = await montar();
  try {
    await enviar(lote(msg({ id: 's', jid: 'status@broadcast', texto: 'estado' }), msg({ id: 'n', jid: '120363000000000009@newsletter', texto: 'canal' })));
    assert.deepEqual(await almacen.resumenChats(), []);
  } finally { await limpiar(dir); }
});

test('migrarBuzon pasa el buzón viejo al almacén sin duplicar y lo borra', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'todos-'));
  try {
    await mkdir(join(dir, 'buzon'), { recursive: true });
    const registros = [
      { id: 'm1', chat: LID, chatAlt: NUMERO, tipo: 'texto', texto: 'uno', fecha: '2026-11-01T10:00:00.000Z', propio: false },
      { id: 'm2', chat: GRUPO, tipo: 'texto', texto: 'dos', fecha: '2026-11-02T10:00:00.000Z', propio: false, esGrupo: true },
    ];
    await writeFile(join(dir, 'buzon', 'aaaaaaaaaaaaaaaa.jsonl'), registros.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const nuevo = new Almacen({ dir, vigilados: new TodosLosChats() });
    assert.equal(await nuevo.migrarBuzon(), 2);
    assert.equal(await nuevo.migrarBuzon(), 0);
    assert.deepEqual((await nuevo.leer({ chat: NUMERO })).map((m) => m.id), ['m1']);
    assert.deepEqual((await nuevo.leer({ chat: LID })).map((m) => m.id), ['m1']);
    assert.equal((await nuevo.leer({ chat: GRUPO })).length, 1);
    assert.equal((await readdir(dir)).includes('buzon') ? (await readdir(join(dir, 'buzon'))).length : 0, 0);
  } finally { await limpiar(dir); }
});

test('el audio en vivo de cualquier chat se descarga al llegar y, si no viene en el payload, se pide a Evolution', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'todos-'));
  try {
    const almacen = new Almacen({ dir, vigilados: new TodosLosChats() });
    const pedidos = [];
    const evolution = { descargarMedia: async (id, chat) => { pedidos.push([id, chat]); return { buffer: Buffer.from('OGGDATA'), mimetype: 'audio/ogg' }; } };
    const manejar = crearManejador({ almacen, secreto: 'S', evolution });
    const r = await manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo: upsert(msg({ id: 'aud1', audio: true })) });
    assert.equal(r.estado, 200);
    assert.deepEqual(pedidos, [['aud1', OTRO]]);
    assert.ok(await almacen.localizarMedio({ mediaId: 'aud1', mimetype: 'audio/ogg; codecs=opus' }));
  } finally { await limpiar(dir); }
});
