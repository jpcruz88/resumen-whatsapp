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

// fetch falso que contesta distinto según el endpoint.
function fetchPorRuta({ chats = [], contactos = [] }, llamadas = []) {
  return async (url, opts) => {
    llamadas.push({ url, opts });
    if (url.includes('/chat/findChats/')) return respuesta(200, chats);
    if (url.includes('/chat/findContacts/')) return respuesta(200, contactos);
    return respuesta(404, {});
  };
}
const contacto = (remoteJid, pushName, extra = {}) => ({
  id: 'cm0x', remoteJid, pushName, isGroup: false, type: 'contact', ...extra,
});
const NUM1 = '5215511111111@s.whatsapp.net';
const NUM2 = '5215522222222@s.whatsapp.net';
const LID1 = '111111111111111@lid';
const LID2 = '222222222222222@lid';

function clienteCon(datos, llamadas) {
  return crearClienteEvolution({ url: 'http://evo', apiKey: 'K', instancia: 'i', fetchFn: fetchPorRuta(datos, llamadas) });
}

test('listarChats consulta findChats y findContacts (POST con where vacío) y mapea a jid/nombre', async () => {
  const llamadas = [];
  const c = clienteCon({
    chats: [{ id: 'cm0x1', remoteJid: NUM1, pushName: 'Cliente Uno' }],
    contactos: [contacto(NUM2, 'Cliente Dos')],
  }, llamadas);
  assert.deepEqual(await c.listarChats(), [
    { jid: NUM2, nombre: 'Cliente Dos' },
    { jid: NUM1, nombre: 'Cliente Uno' },
  ]);
  const urls = llamadas.map((l) => l.url).sort();
  assert.deepEqual(urls, ['http://evo/chat/findChats/i', 'http://evo/chat/findContacts/i']);
  for (const l of llamadas) {
    assert.equal(l.opts.method, 'POST');
    assert.equal(l.opts.headers.apikey, 'K');
  }
  const cont = llamadas.find((l) => l.url.includes('findContacts'));
  assert.deepEqual(JSON.parse(cont.opts.body), { where: {} });
});

test('listarChats funciona con findChats vacío y findContacts con datos', async () => {
  const c = clienteCon({ chats: [], contactos: [contacto(NUM1, 'Cliente Uno')] });
  assert.deepEqual(await c.listarChats(), [{ jid: NUM1, nombre: 'Cliente Uno' }]);
});

test('listarChats incluye los grupos (grupo: true) y sigue descartando bots y difusiones', async () => {
  const c = clienteCon({
    chats: [{ id: 'x1', remoteJid: 'a@g.us', pushName: 'Grupo A' }],
    contactos: [
      contacto('b@g.us', 'Grupo B', { isGroup: true, type: 'group' }),
      contacto('123@bot', 'Bot'),
      contacto('status@broadcast', 'Estado'),
      contacto('lista@broadcast', 'Lista'),
      contacto(NUM1, 'Cliente Uno'),
    ],
  });
  assert.deepEqual(await c.listarChats(), [
    { jid: NUM1, nombre: 'Cliente Uno' },
    { jid: 'a@g.us', nombre: 'Grupo A', grupo: true },
    { jid: 'b@g.us', nombre: 'Grupo B', grupo: true },
  ]);
});
test('listarChats deduplica por jid entre findChats y findContacts', async () => {
  const c = clienteCon({
    chats: [{ id: 'k', remoteJid: NUM1, pushName: null }],
    contactos: [contacto(NUM1, 'Cliente Uno')],
  });
  assert.deepEqual(await c.listarChats(), [{ jid: NUM1, nombre: 'Cliente Uno' }]);
});

test('listarChats con el mismo nombre en @s.whatsapp.net y @lid conserva solo el número', async () => {
  const c = clienteCon({
    contactos: [contacto(LID1, 'Cliente Uno'), contacto(NUM1, 'Cliente Uno')],
  });
  assert.deepEqual(await c.listarChats(), [{ jid: NUM1, nombre: 'Cliente Uno' }]);
});

test('listarChats conserva un @lid cuyo nombre no tiene versión con número', async () => {
  const c = clienteCon({
    contactos: [contacto(LID2, 'Cliente Tres'), contacto(NUM1, 'Cliente Uno'), contacto(LID1, 'Cliente Uno')],
  });
  assert.deepEqual(await c.listarChats(), [
    { jid: LID2, nombre: 'Cliente Tres' },
    { jid: NUM1, nombre: 'Cliente Uno' },
  ]);
});

test('listarChats ordena por nombre sin distinguir mayúsculas ni acentos', async () => {
  const c = clienteCon({
    contactos: [
      contacto(NUM1, 'zeta'),
      contacto(NUM2, 'Álvaro'),
      contacto(LID1, 'beto'),
      contacto(LID2, 'Ana'),
    ],
  });
  const nombres = (await c.listarChats()).map((x) => x.nombre);
  assert.deepEqual(nombres, ['Álvaro', 'Ana', 'beto', 'zeta']);
});

test('listarChats pone al final los nombres que no empiezan con letra o número', async () => {
  const c = clienteCon({
    contactos: [
      contacto(NUM1, '.'),
      contacto(NUM2, 'Zeta'),
      contacto(LID1, '¡Hola'),
      contacto(LID2, 'Ana'),
    ],
  });
  const nombres = (await c.listarChats()).map((x) => x.nombre);
  assert.deepEqual(nombres.slice(0, 2), ['Ana', 'Zeta']);
  assert.deepEqual(new Set(nombres.slice(2)), new Set(['.', '¡Hola']));
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

test('rutaMedio devuelve media/<basename(id)>.<ext> con el mismo mapeo que guardarMedio', () => {
  const dir = '/datos';
  const a = new Almacen({ dir, vigilados: { esVigilado: async () => true } });
  const casos = [
    ['audio/ogg; codecs=opus', 'ogg'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['application/x-raro', 'bin'],
    [undefined, 'bin'],
  ];
  for (const [mimetype, ext] of casos) {
    assert.equal(a.rutaMedio({ mediaId: 'M1', mimetype }), join(dir, 'media', `M1.${ext}`));
  }
  assert.equal(a.rutaMedio({ mediaId: '../../etc/x', mimetype: 'image/png' }), join(dir, 'media', 'x.png'));
});

// fetch falso que respeta la señal: no responde nunca, solo rechaza al abortarse.
const fetchColgado = (opts) => new Promise((_, reject) => {
  if (!opts.signal) return; // sin señal se queda colgado: la prueba lo detecta con su propio limite
  opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
});

for (const [nombre, llamar] of [
  ['descargarMedia', (c) => c.descargarMedia('X', 'c')],
  ['listarChats', (c) => c.listarChats()],
]) {
  test(`${nombre} rechaza por timeout en vez de colgarse`, async () => {
    const c = crearClienteEvolution({
      url: 'http://evo', apiKey: 'K', instancia: 'i', timeoutMs: 50,
      fetchFn: async (url, opts) => fetchColgado(opts),
    });
    const limite = new Promise((_, rej) => setTimeout(() => rej(new Error('colgado: no uso signal')), 2000));
    await assert.rejects(Promise.race([llamar(c), limite]), (e) => e.name === 'TimeoutError');
  });
}

test('el timeout por defecto es de 30 s y se pasa signal a fetch', async () => {
  let opts;
  const c = crearClienteEvolution({
    url: 'http://evo', apiKey: 'K', instancia: 'i',
    fetchFn: async (u, o) => { opts = o; return respuesta(200, []); },
  });
  await c.listarChats();
  assert.ok(opts.signal instanceof AbortSignal);
});
