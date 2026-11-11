import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearPanel } from '../src/panel.js';
import { servirReporte } from '../src/servidor.js';

const JID = '5215512345678@s.whatsapp.net';
const GRUPO = '120363000000000001@g.us';
const LID = '100000000000001@lid';
const AHORA = new Date(2026, 10, 11, 15, 0, 0);
const iso = (y, m, d, h = 12, mi = 0) => new Date(y, m, d, h, mi).toISOString();

const CHATS = [
  { chat: GRUPO, total: 1161, primero: iso(2025, 10, 13), ultimo: iso(2026, 10, 11, 14, 20), esGrupo: true },
  { chat: JID, total: 312, primero: iso(2026, 7, 12), ultimo: iso(2026, 10, 10, 19, 40), esGrupo: false },
  { chat: LID, total: 5, primero: iso(2026, 9, 1), ultimo: iso(2026, 9, 16), esGrupo: false },
];

function montar(extra = {}) {
  const llamadas = [];
  const panel = crearPanel({
    almacen: { resumenChats: async () => CHATS, formas: async (c) => [c] },
    evolution: { listarChats: async () => [{ jid: JID, nombre: 'Ana <b>& Co' }, { jid: GRUPO, nombre: 'Equipo Ventas', grupo: true }] },
    generar: async (a) => { llamadas.push(a); return { id: 'abc-1', url: '/reportes/abc-1' }; },
    ahora: () => AHORA,
    ...extra,
  });
  return { panel, llamadas };
}
const get = (panel, ruta, consulta = '') => panel({ metodo: 'GET', ruta, consulta });

test('GET / lista todos los chats guardados, el más reciente primero, con nombre escapado y enlace al chat', async () => {
  const { panel } = montar();
  const r = await get(panel, '/');
  assert.equal(r.estado, 200);
  const filas = [...r.html.matchAll(/<li[^>]*data-buscar="([^"]*)"[^>]*>[\s\S]*?<a class="fila" href="([^"]*)"/g)];
  assert.equal(filas.length, 3);
  assert.ok(filas[0][2].endsWith(encodeURIComponent(GRUPO)));
  assert.ok(r.html.includes('Ana &lt;b&gt;&amp; Co'));
  assert.ok(!r.html.includes('<b>&'));
  assert.ok(filas[1][1].includes('Ana &lt;b&gt;&amp; Co') && filas[1][1].includes('5215512345678'), 'se busca por nombre y por número');
});

test('cada fila dice cuándo fue el último mensaje y cuántos hay', async () => {
  const { panel } = montar();
  const { html } = await get(panel, '/');
  assert.match(html, /hoy 14:20 · 1161 mensajes/);
  assert.match(html, /ayer 19:40 · 312 mensajes/);
  assert.match(html, /16 oct · 5 mensajes/);
});

test('un contacto o grupo sin nombre se muestra claro, sin el número completo', async () => {
  const { panel } = montar({ almacen: { resumenChats: async () => [
    { chat: '555123456789@lid', total: 2, primero: iso(2026, 10, 1), ultimo: iso(2026, 10, 2), esGrupo: false },
    { chat: '120363000000000009@g.us', total: 3, primero: iso(2026, 10, 1), ultimo: iso(2026, 10, 1), esGrupo: true },
  ], formas: async (c) => [c] } });
  const { html } = await get(panel, '/');
  assert.match(html, /Contacto sin nombre \(…6789\)/);
  assert.match(html, /Grupo sin nombre/);
  assert.ok(!html.replace(/href="[^"]*"/g, '').includes('555123456789'), 'el número completo no se muestra');
});

test('si Evolution no responde la lista abre igual, con aviso', async () => {
  const { panel } = montar({ evolution: { listarChats: async () => { throw new Error('fetch failed'); } } });
  const r = await get(panel, '/');
  assert.equal(r.estado, 200);
  assert.match(r.html, /<p id="aviso" class="msg error" role="alert">[^<]*WhatsApp[^<]*desconectado/);
  assert.match(r.html, /Contacto sin nombre/);
});

test('sin ningún mensaje guardado explica qué pasa', async () => {
  const { panel } = montar({ almacen: { resumenChats: async () => [], formas: async (c) => [c] } });
  const { html } = await get(panel, '/');
  assert.match(html, /Todavía no hay mensajes guardados/);
  assert.ok(!html.includes('class="fila"'));
});

test('la lista trae buscador, filtro Todos/Personas/Grupos y es una página móvil accesible', async () => {
  const { panel } = montar();
  const { html } = await get(panel, '/');
  assert.match(html, /<input[^>]*type="search"[^>]*id="buscar"/);
  for (const v of ['todos', 'personas', 'grupos']) assert.match(html, new RegExp('name="filtro" value="' + v + '"'));
  assert.match(html, /<html lang="es">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /name="color-scheme" content="light dark"/);
  assert.match(html, /data-tipo="grupo"/);
  assert.match(html, /data-tipo="persona"/);
  assert.ok(html.includes(String.raw`[\u0300-\u036f]`), 'el buscador ignora acentos');
  assert.match(html, /Resumen de WhatsApp v\d+\.\d+\.\d+ · Desarrollado por JP/);
});

test('ya no existe la idea de vigilar: ni botones ni ruta', async () => {
  const { panel } = montar();
  const { html } = await get(panel, '/');
  assert.ok(!/vigil/i.test(html), 'la página no menciona vigilar');
  const r = await panel({ metodo: 'POST', ruta: '/vigilar', cuerpo: { chat: JID, activo: true } });
  assert.equal(r.estado, 404);
});

test('GET /chat muestra el chat, cuántos mensajes tiene y el formulario del resumen', async () => {
  const { panel } = montar();
  const r = await get(panel, '/chat', 'chat=' + encodeURIComponent(JID));
  assert.equal(r.estado, 200);
  assert.match(r.html, /<h1[^>]*>Ana &lt;b&gt;&amp; Co<\/h1>/);
  assert.match(r.html, /312 mensajes/);
  assert.match(r.html, /12 de agosto al 10 de noviembre de 2026/);
  assert.match(r.html, /<form id="form-resumen"[^>]*data-chat="5215512345678@s\.whatsapp\.net"/);
  for (const v of ['hoy', 'ayer', '7dias', 'rango']) assert.match(r.html, new RegExp('name="periodo" value="' + v + '"'));
  assert.match(r.html, /id="generar"/);
  assert.match(r.html, /id="ver-conversacion"/);
  assert.match(r.html, /href="\/"/);
});

test('GET /chat sugiere el último día con mensajes cuando hoy no hay', async () => {
  const { panel } = montar();
  const sin = await get(panel, '/chat', 'chat=' + encodeURIComponent(JID));
  assert.match(sin.html, /data-dia="2026-11-10"/);
  const con = await get(panel, '/chat', 'chat=' + encodeURIComponent(GRUPO));
  assert.ok(!con.html.includes('data-dia='), 'si hoy hay mensajes no hace falta sugerir otro día');
});

test('GET /chat de un chat sin mensajes o sin parámetro responde 404 con un camino de vuelta', async () => {
  const { panel } = montar();
  for (const consulta of ['chat=nadie%40g.us', '']) {
    const r = await get(panel, '/chat', consulta);
    assert.equal(r.estado, 404);
    assert.match(r.html, /href="\/"/);
  }
});

test('POST /resumen genera el reporte de cualquier chat con mensajes, con su nombre y el periodo', async () => {
  const { panel, llamadas } = montar();
  const r = await panel({ metodo: 'POST', ruta: '/resumen', cuerpo: { chat: JID, desde: '2026-11-01', hasta: '2026-11-02' } });
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo, { url: '/reportes/abc-1' });
  assert.deepEqual(llamadas[0], {
    chat: JID,
    nombre: 'Ana <b>& Co',
    desde: new Date(2026, 10, 1, 0, 0, 0, 0).toISOString(),
    hasta: new Date(2026, 10, 2, 23, 59, 59, 999).toISOString(),
  });
});

test('POST /resumen valida chat y fechas', async () => {
  const { panel, llamadas } = montar();
  assert.equal((await panel({ metodo: 'POST', ruta: '/resumen', cuerpo: { desde: '2026-11-01', hasta: '2026-11-02' } })).estado, 400);
  assert.equal((await panel({ metodo: 'POST', ruta: '/resumen', cuerpo: { chat: JID, desde: 'ayer', hasta: '2026-11-02' } })).estado, 400);
  assert.equal(llamadas.length, 0);
});

test('GET /reportes/:id sirve el HTML guardado; 404 si no existe o es invalido', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rep-'));
  try {
    await writeFile(join(dir, 'abc-1.html'), '<p>hola</p>');
    const ok = await servirReporte({ dirReportes: dir, id: 'abc-1' });
    assert.equal(ok.estado, 200);
    assert.equal(ok.html, '<p>hola</p>');
    assert.equal((await servirReporte({ dirReportes: dir, id: 'dead-beef' })).estado, 404);
    assert.equal((await servirReporte({ dirReportes: dir, id: '../abc-1' })).estado, 404);
    assert.equal((await servirReporte({ dirReportes: dir, id: '..%2Fabc-1' })).estado, 404);
    assert.equal((await servirReporte({ dirReportes: dir, id: '' })).estado, 404);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- router: proteccion de rutas del panel ----------
import { crearRouter } from '../src/servidor.js';

function router() {
  const webhook = async () => ({ estado: 200, cuerpo: { ok: true } });
  const panel = async () => ({ estado: 200, cuerpo: { ok: true } });
  return crearRouter({ webhook, panel, dirReportes: '/nada', hosts: ['127.0.0.1:3100', 'localhost:3100', 'panel.ejemplo.com'] });
}
const JSON_CT = 'application/json';

test('POST /resumen con content-type text/plain responde 415', async () => {
  const r = await router()({ metodo: 'POST', ruta: '/resumen', cabeceras: { host: '127.0.0.1:3100', 'content-type': 'text/plain' }, cuerpo: {} });
  assert.equal(r.estado, 415);
});

test('POST /resumen con Host ajeno responde 403', async () => {
  const r = await router()({ metodo: 'POST', ruta: '/resumen', cabeceras: { host: 'evil.example', 'content-type': JSON_CT }, cuerpo: {} });
  assert.equal(r.estado, 403);
});

test('GET / con Host ajeno responde 403', async () => {
  const r = await router()({ metodo: 'GET', ruta: '/', cabeceras: { host: 'evil.example' } });
  assert.equal(r.estado, 403);
});

test('POST /resumen con JSON y Host permitido procede', async () => {
  for (const host of ['127.0.0.1:3100', 'panel.ejemplo.com']) {
    const r = await router()({ metodo: 'POST', ruta: '/resumen', cabeceras: { host, 'content-type': 'application/json; charset=utf-8' }, cuerpo: {} });
    assert.equal(r.estado, 200);
  }
});

test('POST /webhook/evolution con Host de Docker sigue funcionando', async () => {
  const r = await router()({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { host: 'host.docker.internal:3100', apikey: 'x' }, cuerpo: {} });
  assert.equal(r.estado, 200);
});

// ---------- ids generados por guardarReporte ----------
import { guardarReporte } from '../src/reporte.js';

test('un reporte recien guardado se sirve por el router (id generado pasa la validacion)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rep-id-'));
  try {
    const id = await guardarReporte({ dir, html: '<p>listo</p>' });
    const enrutar = crearRouter({
      webhook: async () => ({ estado: 200, cuerpo: {} }),
      panel: async () => ({ estado: 200, cuerpo: {} }),
      dirReportes: dir,
      hosts: ['127.0.0.1:3100'],
    });
    const r = await enrutar({ metodo: 'GET', ruta: `/reportes/${id}`, cabeceras: { host: '127.0.0.1:3100' } });
    assert.equal(r.estado, 200);
    assert.equal(r.html, '<p>listo</p>');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('servirReporte sigue rechazando traversal, barras, % y mayusculas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rep-id-'));
  try {
    await writeFile(join(dir, 'abc-1.html'), 'x');
    for (const id of ['..', '../abc-1', 'a/b', 'a%2Fb', 'ABC-1', 'abc 1']) {
      assert.equal((await servirReporte({ dirReportes: dir, id })).estado, 404, id);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('un reporte guardado antes de que existieran las negritas se sirve sin asteriscos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rep-'));
  try {
    await writeFile(join(dir, 'viejo-1.html'), '<ul><li>**Reporte de NIP:** Rokiloki</li><li>2 * 3 * 4</li></ul>');
    const r = await servirReporte({ dirReportes: dir, id: 'viejo-1' });
    assert.equal(r.html, '<ul><li><strong>Reporte de NIP:</strong> Rokiloki</li><li>2 * 3 * 4</li></ul>');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
