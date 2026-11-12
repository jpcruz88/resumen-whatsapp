import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearClienteInstagram, parsearHilo, sincronizar, ErrorInstagram } from '../src/instagram.js';
import { Almacen } from '../src/almacen.js';
import { TodosLosChats } from '../src/vigilados.js';

const COOKIE = 'datr=AAAA; csrftoken=tokenfalso; ds_user_id=11; sessionid=11%3Afalsa%3A1';
const YO = '11';
const OTRO = '22';

const item = (n, extra = {}) => ({ item_id: `it${n}`, user_id: OTRO, timestamp: String(1_790_000_000_000_000 + n * 1_000_000), item_type: 'text', text: `mensaje ${n}`, ...extra });
const hilo = (items, extra = {}) => ({
  thread_id: 'T1', thread_title: 'Ana Prueba', is_group: false, viewer_id: YO, has_older: false,
  users: [{ pk: OTRO, username: 'ana_prueba', full_name: 'Ana Prueba' }], items, ...extra,
});

// ---------- parsearHilo ----------

test('un hilo se convierte en mensajes con el mismo formato que los de WhatsApp', () => {
  const [a, b] = parsearHilo(hilo([item(1), item(2, { user_id: YO })]), YO);
  assert.equal(a.id, 'ig-it1');
  assert.equal(a.chat, 'ig:T1');
  assert.equal(a.propio, false);
  assert.equal(a.nombre, 'Ana Prueba');
  assert.equal(a.tipo, 'texto');
  assert.equal(a.texto, 'mensaje 1');
  assert.equal(a.fecha, new Date(1_790_000_001_000).toISOString());
  assert.equal(b.propio, true);
  assert.equal(b.nombre, 'Yo');
});

test('toma el texto de enlaces y reels compartidos; ignora lo que no tiene texto', () => {
  const ms = parsearHilo(hilo([
    item(1, { item_type: 'link', text: undefined, link: { text: 'mira esto' } }),
    item(2, { item_type: 'reel_share', text: undefined, reel_share: { text: 'jaja' } }),
    item(3, { item_type: 'like', text: undefined }),
    item(4, { item_type: 'action_log', text: undefined }),
    item(5, { text: '   ' }),
  ]), YO);
  assert.deepEqual(ms.map((m) => m.texto), ['mira esto', 'jaja']);
});

test('en un grupo marca esGrupo, el autor y el nombre de quien escribió', () => {
  const g = hilo([item(1)], { is_group: true, thread_title: 'Equipo IG', users: [{ pk: OTRO, username: 'ana', full_name: 'Ana P' }, { pk: '33', username: 'beto', full_name: '' }] });
  const [m] = parsearHilo(g, YO);
  assert.equal(m.esGrupo, true);
  assert.equal(m.autor, `ig:${OTRO}`);
  assert.equal(m.nombre, 'Ana P');
  const [n] = parsearHilo({ ...g, items: [item(2, { user_id: '33' })] }, YO);
  assert.equal(n.nombre, 'beto');
});

// ---------- cliente ----------

function respuesta(estado, cuerpo) {
  return { ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo };
}

test('el cliente pide la bandeja con la cookie y los encabezados del navegador, y nunca envía nada', async () => {
  const llamadas = [];
  const cliente = crearClienteInstagram({ cookie: COOKIE, fetchFn: async (url, op) => { llamadas.push({ url, op }); return respuesta(200, { status: 'ok', viewer: { pk: YO }, inbox: { threads: [hilo([item(1)])], has_older: true, oldest_cursor: 'C1' } }); } });
  const r = await cliente.bandeja();
  assert.equal(r.yo, YO);
  assert.equal(r.hilos.length, 1);
  assert.equal(r.hayMas, true);
  assert.equal(r.cursor, 'C1');
  const { url, op } = llamadas[0];
  assert.match(url, /^https:\/\/i\.instagram\.com\/api\/v1\/direct_v2\/inbox\//);
  assert.equal(op.method ?? 'GET', 'GET');
  assert.equal(op.headers.cookie, COOKIE);
  assert.equal(op.headers['x-csrftoken'], 'tokenfalso');
  assert.equal(op.headers['x-ig-app-id'], '936619743392459');
  await cliente.bandeja({ cursor: 'C1' });
  assert.match(llamadas[1].url, /cursor=C1/);
});

test('el cliente pide un hilo por su id con paginación', async () => {
  let pedido;
  const cliente = crearClienteInstagram({ cookie: COOKIE, fetchFn: async (url) => { pedido = url; return respuesta(200, { status: 'ok', thread: hilo([item(1)], { has_older: true, oldest_cursor: 'C2' }) }); } });
  const r = await cliente.hilo('T1', { cursor: 'C1' });
  assert.match(pedido, /direct_v2\/threads\/T1\/\?.*cursor=C1/);
  assert.equal(r.hilo.thread_id, 'T1');
  assert.equal(r.hayMas, true);
  assert.equal(r.cursor, 'C2');
});

test('sesión vencida, verificación o límite se distinguen y no filtran la cookie', async () => {
  const caso = async (estado, cuerpo) => {
    const c = crearClienteInstagram({ cookie: COOKIE, fetchFn: async () => respuesta(estado, cuerpo) });
    return c.bandeja().then(() => null, (e) => e);
  };
  const e1 = await caso(403, { message: 'login_required', status: 'fail' });
  const e2 = await caso(400, { message: 'checkpoint_required', status: 'fail' });
  const e3 = await caso(429, { message: 'Please wait a few minutes', status: 'fail' });
  const e4 = await caso(500, {});
  assert.ok(e1 instanceof ErrorInstagram);
  assert.deepEqual([e1.codigo, e2.codigo, e3.codigo, e4.codigo], ['sesion', 'sesion', 'limite', 'otro']);
  for (const e of [e1, e2, e3, e4]) assert.ok(!e.message.includes('falsa') && !e.message.includes('tokenfalso'));
});

test('el error incluye el mensaje corto de Instagram, solo texto simple', async () => {
  const c = crearClienteInstagram({ cookie: COOKIE, fetchFn: async () => respuesta(400, { message: 'useragent mismatch <script>' + 'x'.repeat(200), status: 'fail' }) });
  const e = await c.bandeja().catch((x) => x);
  assert.equal(e.codigo, 'otro');
  assert.match(e.message, /HTTP 400: useragent mismatch/);
  assert.ok(e.message.length < 140);
  assert.ok(!e.message.includes('<'));
});

test('sin sessionid en la cookie no se crea el cliente', () => {
  assert.throws(() => crearClienteInstagram({ cookie: 'datr=AAAA' }), /INSTAGRAM_COOKIE/);
});

// ---------- sincronizar ----------

async function entorno(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'ig-'));
  try { await fn({ dir, almacen: new Almacen({ dir, vigilados: new TodosLosChats() }) }); } finally { await rm(dir, { recursive: true, force: true }); }
}

function clienteFalso({ hilos, paginas = {}, fallaEn }) {
  const llamadas = [];
  return {
    llamadas,
    async bandeja() { llamadas.push('bandeja'); return { yo: YO, hilos, hayMas: false, cursor: null }; },
    async hilo(id, { cursor } = {}) {
      llamadas.push(`hilo:${id}:${cursor ?? ''}`);
      if (fallaEn === llamadas.length) throw new ErrorInstagram('sesion', 'sesión vencida');
      return paginas[`${id}:${cursor ?? ''}`] ?? { hilo: hilo([]), hayMas: false, cursor: null };
    },
  };
}

test('guarda lo de la bandeja y sigue pidiendo páginas viejas mientras haya mensajes nuevos', () => entorno(async ({ dir, almacen }) => {
  const cliente = clienteFalso({
    hilos: [hilo([item(5), item(6)], { has_older: true, oldest_cursor: 'P1' })],
    paginas: {
      'T1:P1': { hilo: hilo([item(3), item(4)]), hayMas: true, cursor: 'P2' },
      'T1:P2': { hilo: hilo([item(1), item(2)]), hayMas: false, cursor: null },
    },
  });
  const r = await sincronizar({ cliente, almacen, dir, pausa: async () => {} });
  assert.equal(r.nuevos, 6);
  assert.equal(r.detenido, null);
  const chats = await almacen.resumenChats();
  assert.equal(chats.length, 1);
  assert.equal(chats[0].chat, 'ig:T1');
  assert.equal(chats[0].total, 6);
}));

test('una segunda corrida sin nada nuevo no pide páginas viejas ni duplica', () => entorno(async ({ dir, almacen }) => {
  const hilos = [hilo([item(5), item(6)], { has_older: true, oldest_cursor: 'P1' })];
  const paginas = { 'T1:P1': { hilo: hilo([item(3), item(4)]), hayMas: false, cursor: null } };
  await sincronizar({ cliente: clienteFalso({ hilos, paginas }), almacen, dir, pausa: async () => {} });
  const c2 = clienteFalso({ hilos, paginas });
  const r = await sincronizar({ cliente: c2, almacen, dir, pausa: async () => {} });
  assert.equal(r.nuevos, 0);
  assert.deepEqual(c2.llamadas, ['bandeja']);
  assert.equal((await almacen.resumenChats())[0].total, 4);
}));

test('respeta el tope de páginas por hilo', () => entorno(async ({ dir, almacen }) => {
  const hilos = [hilo([item(9)], { has_older: true, oldest_cursor: 'P1' })];
  const paginas = {
    'T1:P1': { hilo: hilo([item(8)]), hayMas: true, cursor: 'P2' },
    'T1:P2': { hilo: hilo([item(7)]), hayMas: true, cursor: 'P3' },
    'T1:P3': { hilo: hilo([item(6)]), hayMas: true, cursor: 'P4' },
  };
  const c = clienteFalso({ hilos, paginas });
  const r = await sincronizar({ cliente: c, almacen, dir, paginasMax: 2, pausa: async () => {} });
  assert.equal(r.nuevos, 3);
  assert.equal(c.llamadas.filter((l) => l.startsWith('hilo')).length, 2);
}));

test('si la sesión falla se detiene sin reintentar y conserva lo ya guardado', () => entorno(async ({ dir, almacen }) => {
  const hilos = [hilo([item(5)], { has_older: true, oldest_cursor: 'P1' }), hilo([item(1)], { thread_id: 'T2' })];
  const c = clienteFalso({ hilos, fallaEn: 2 });
  const r = await sincronizar({ cliente: c, almacen, dir, pausa: async () => {} });
  assert.equal(r.detenido, 'sesion');
  assert.equal(c.llamadas.filter((l) => l.startsWith('hilo')).length, 1);
  assert.equal(r.nuevos, 2);
}));

test('guarda el nombre de cada chat para el panel', () => entorno(async ({ dir, almacen }) => {
  await sincronizar({ cliente: clienteFalso({ hilos: [hilo([item(1)])] }), almacen, dir, pausa: async () => {} });
  const nombres = JSON.parse(await readFile(join(dir, 'instagram-nombres.json'), 'utf8'));
  assert.equal(nombres['ig:T1'], 'Ana Prueba');
}));
