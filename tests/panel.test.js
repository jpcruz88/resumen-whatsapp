import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearPanel } from '../src/panel.js';
import { servirReporte } from '../src/servidor.js';
import { Vigilados } from '../src/vigilados.js';

const JID = '5215512345678@s.whatsapp.net';

async function montar(extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'panel-'));
  const vigilados = new Vigilados({ archivo: join(dir, 'v.json') });
  const llamadas = [];
  const panel = crearPanel({
    vigilados,
    evolution: { listarChats: async () => [{ jid: JID, nombre: 'Ana <b>& Co' }] },
    generar: async (a) => { llamadas.push(a); return { id: 'abc-1', url: '/reportes/abc-1' }; },
    ...extra,
  });
  return { dir, vigilados, panel, llamadas };
}

test('GET / lista chats con nombre y JID escapados', async () => {
  const { dir, panel } = await montar();
  try {
    const r = await panel({ metodo: 'GET', ruta: '/' });
    assert.equal(r.estado, 200);
    assert.ok(r.html.includes('Ana &lt;b&gt;&amp; Co'));
    assert.ok(!r.html.includes('<b>&'));
    assert.ok(r.html.includes(JID));
    assert.match(r.html, /Generar resumen/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('GET / muestra los vigilados en su lista y el selector ofrece solo esos chats', async () => {
  const otro = '5215599999999@s.whatsapp.net';
  const { dir, panel, vigilados } = await montar({
    evolution: { listarChats: async () => [{ jid: JID, nombre: 'Ana' }, { jid: otro, nombre: 'Beto' }] },
  });
  try {
    await vigilados.activar(JID);
    const { html } = await panel({ metodo: 'GET', ruta: '/' });
    const lista = html.match(/<ul[^>]*id="lista-vigilados"[^>]*>([\s\S]*?)<\/ul>/)[1];
    assert.ok(lista.includes(JID) && !lista.includes(otro));
    const resultados = html.match(/<ul[^>]*id="lista-resultados"[^>]*>([\s\S]*?)<\/ul>/)[1];
    assert.ok(resultados.includes(otro) && !resultados.includes(JID));
    const selector = html.match(/<select[^>]*id="chat"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.ok(selector.includes(JID) && !selector.includes(otro));
    assert.match(html, /<span id="cuenta-vigilados">1<\/span>/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('GET / sin chats vigilados explica qué hacer y no ofrece un selector vacío', async () => {
  const { dir, panel } = await montar();
  try {
    const { html } = await panel({ metodo: 'GET', ruta: '/' });
    assert.match(html, /Aún no vigilas ningún chat/);
    assert.ok(!html.includes('<select'));
    assert.match(html, /<span id="cuenta-vigilados">0<\/span>/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('GET / es una página móvil y accesible: idioma, viewport, esquema de color y controles con etiqueta', async () => {
  const { dir, panel, vigilados } = await montar();
  try {
    await vigilados.activar(JID);
    const { html } = await panel({ metodo: 'GET', ruta: '/' });
    assert.match(html, /<html lang="es"/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/);
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /prefers-reduced-motion: reduce/);
    assert.match(html, /<label for="chat">/);
    assert.match(html, /<label for="buscar">/);
    for (const v of ['hoy', 'ayer', '7dias', 'rango']) {
      assert.match(html, new RegExp(`<input[^>]*type="radio"[^>]*name="periodo"[^>]*value="${v}"`));
    }
    assert.match(html, /<div id="rango"[^>]*hidden/);
    assert.match(html, /<[^>]*id="estado"[^>]*aria-live="polite"/);
    assert.ok(!/ on[a-z]+=/.test(html), 'sin manejadores de eventos en línea');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('POST /vigilar activa y desactiva', async () => {
  const { dir, panel, vigilados } = await montar();
  try {
    const r = await panel({ metodo: 'POST', ruta: '/vigilar', cuerpo: { chat: JID, activo: true } });
    assert.equal(r.estado, 200);
    assert.equal(await vigilados.esVigilado(JID), true);
    await panel({ metodo: 'POST', ruta: '/vigilar', cuerpo: { chat: JID, activo: false } });
    assert.equal(await vigilados.esVigilado(JID), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('POST /resumen de chat no vigilado responde 403 y no genera', async () => {
  const { dir, panel, llamadas } = await montar();
  try {
    const r = await panel({ metodo: 'POST', ruta: '/resumen', cuerpo: { chat: JID, desde: '2026-11-01', hasta: '2026-11-02' } });
    assert.equal(r.estado, 403);
    assert.equal(llamadas.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('POST /resumen de chat vigilado devuelve la url', async () => {
  const { dir, panel, vigilados, llamadas } = await montar();
  try {
    await vigilados.activar(JID);
    const r = await panel({ metodo: 'POST', ruta: '/resumen', cuerpo: { chat: JID, desde: '2026-11-01', hasta: '2026-11-02' } });
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { url: '/reportes/abc-1' });
    assert.deepEqual(llamadas[0], {
      chat: JID,
      desde: new Date(2026, 10, 1, 0, 0, 0, 0).toISOString(),
      hasta: new Date(2026, 10, 2, 23, 59, 59, 999).toISOString(),
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
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

test('POST /vigilar con content-type text/plain responde 415', async () => {
  const r = await router()({ metodo: 'POST', ruta: '/vigilar', cabeceras: { host: '127.0.0.1:3100', 'content-type': 'text/plain' }, cuerpo: {} });
  assert.equal(r.estado, 415);
});

test('POST /vigilar con Host ajeno responde 403', async () => {
  const r = await router()({ metodo: 'POST', ruta: '/vigilar', cabeceras: { host: 'evil.example', 'content-type': JSON_CT }, cuerpo: {} });
  assert.equal(r.estado, 403);
});

test('GET / con Host ajeno responde 403', async () => {
  const r = await router()({ metodo: 'GET', ruta: '/', cabeceras: { host: 'evil.example' } });
  assert.equal(r.estado, 403);
});

test('POST /vigilar con JSON y Host permitido procede', async () => {
  for (const host of ['127.0.0.1:3100', 'panel.ejemplo.com']) {
    const r = await router()({ metodo: 'POST', ruta: '/vigilar', cabeceras: { host, 'content-type': 'application/json; charset=utf-8' }, cuerpo: {} });
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

// ---------- buscador de la lista ----------
test('GET / trae un buscador y cada fila lleva en data-buscar el nombre y el JID escapados', async () => {
  const { dir, panel } = await montar();
  try {
    const r = await panel({ metodo: 'GET', ruta: '/' });
    assert.match(r.html, /<input[^>]*type="search"[^>]*id="buscar"/);
    const fila = r.html.match(/<li[^>]*data-buscar="([^"]*)"[^>]*>/);
    assert.ok(fila, 'la fila debe llevar data-buscar');
    assert.ok(fila[1].includes('Ana &lt;b&gt;&amp; Co'));
    assert.ok(fila[1].includes(JID));
    assert.ok(!r.html.includes('<b>&'));
    assert.match(r.html, /normalize\('NFD'\)/);
    // El escape debe llegar al navegador como texto \u0300, no como el carácter ya resuelto.
    assert.ok(r.html.includes(String.raw`[\u0300-\u036f]`));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('GET / escapa comillas del nombre en data-buscar', async () => {
  const { dir, panel } = await montar({
    evolution: { listarChats: async () => [{ jid: JID, nombre: 'x" onmouseover="alert(1)' }] },
  });
  try {
    const r = await panel({ metodo: 'GET', ruta: '/' });
    assert.ok(!r.html.includes('x" onmouseover'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('GET / muestra en el pie la versión de package.json y "Desarrollado por JP"', async () => {
  const { dir, panel } = await montar();
  try {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const r = await panel({ metodo: 'GET', ruta: '/' });
    assert.equal(r.estado, 200);
    const pie = r.html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
    assert.ok(pie, 'la página debe tener un <footer>');
    assert.ok(pie[1].includes(`v${pkg.version}`), `el pie debe incluir v${pkg.version}`);
    assert.ok(pie[1].includes('Desarrollado por JP'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
