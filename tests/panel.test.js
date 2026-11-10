import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

test('GET / marca como checked el chat vigilado', async () => {
  const { dir, panel, vigilados } = await montar();
  try {
    await vigilados.activar(JID);
    const r = await panel({ metodo: 'GET', ruta: '/' });
    assert.match(r.html, /checked/);
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
    assert.deepEqual(llamadas[0], { chat: JID, desde: '2026-11-01', hasta: '2026-11-02' });
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
