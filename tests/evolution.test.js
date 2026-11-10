import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearClienteEvolution } from '../src/evolution.js';
import { Almacen } from '../src/almacen.js';

const respuesta = (status, cuerpo) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
});

test('descargarMedia decodifica base64 y envia apikey y cuerpo correctos', async () => {
  let llamada;
  const fetchFn = async (url, opts) => {
    llamada = { url, opts };
    return respuesta(200, { base64: Buffer.from('hola').toString('base64'), mimetype: 'audio/ogg' });
  };
  const c = crearClienteEvolution({ url: 'http://evo', apiKey: 'K', instancia: 'inst', fetchFn });
  const r = await c.descargarMedia('ABC', 'chat@g.us');
  assert.equal(r.buffer.toString(), 'hola');
  assert.equal(r.mimetype, 'audio/ogg');
  assert.equal(llamada.url, 'http://evo/chat/getBase64FromMediaMessage/inst');
  assert.equal(llamada.opts.method, 'POST');
  assert.equal(llamada.opts.headers.apikey, 'K');
  assert.deepEqual(JSON.parse(llamada.opts.body), { message: { key: { id: 'ABC' } }, convertToMp4: false });
});

test('descargarMedia lanza error con el status si no es 2xx', async () => {
  const fetchFn = async () => respuesta(500, {});
  const c = crearClienteEvolution({ url: 'http://evo', apiKey: 'K', instancia: 'i', fetchFn });
  await assert.rejects(() => c.descargarMedia('X', 'c'), /500/);
});

test('listarChats mapea id/pushName a jid/nombre', async () => {
  let llamada;
  const fetchFn = async (url, opts) => {
    llamada = { url, opts };
    return respuesta(200, [{ id: 'a@g.us', pushName: 'Grupo A' }, { id: 'b@s.whatsapp.net', pushName: 'Bea' }]);
  };
  const c = crearClienteEvolution({ url: 'http://evo', apiKey: 'K', instancia: 'i', fetchFn });
  assert.deepEqual(await c.listarChats(), [
    { jid: 'a@g.us', nombre: 'Grupo A' },
    { jid: 'b@s.whatsapp.net', nombre: 'Bea' },
  ]);
  assert.equal(llamada.url, 'http://evo/chat/findChats/i');
  assert.equal(llamada.opts.method, 'POST');
});

test('guardarMedio escribe media/<id>.<ext> segun mimetype', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alm-'));
  const a = new Almacen({ dir, vigilados: { esVigilado: async () => true } });
  const casos = [
    ['audio/ogg; codecs=opus', 'ogg'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ];
  for (const [mimetype, ext] of casos) {
    const ruta = await a.guardarMedio({ chat: 'c', mediaId: 'M1', mimetype, buffer: Buffer.from('xyz') });
    assert.equal(ruta, join(dir, 'media', `M1.${ext}`));
    assert.equal((await readFile(ruta)).toString(), 'xyz');
  }
});

test('guardarMedio no escribe nada y devuelve null en chat no vigilado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alm-'));
  const a = new Almacen({ dir, vigilados: { esVigilado: async () => false } });
  const ruta = await a.guardarMedio({ chat: 'x', mediaId: 'M2', mimetype: 'image/png', buffer: Buffer.from('abc') });
  assert.equal(ruta, null);
  await assert.rejects(() => access(join(dir, 'media')), { code: 'ENOENT' });
});
