import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nombreMostrable, resolverMenciones, conNombres } from '../src/nombres.js';
import { crearClienteEvolution } from '../src/evolution.js';
import { crearConversacion } from '../src/conversacion.js';
import { generarReporte } from '../src/reportar.js';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';

const ANA = '100000000000001@lid';
const BETO = '100000000000002@lid';
const GRUPO = '120363000000000001@g.us';
const mapa = new Map([[ANA, 'Ana Beltrán'], [BETO, 'Beto Ríos'], ['5215511111111@s.whatsapp.net', 'Carla Mendoza'], ['777888999@lid', '999888777']]);

// ---------- nombreMostrable ----------

test('el nombre sale de la lista de contactos cuando el mensaje solo trae el número', () => {
  const m = { propio: false, autor: ANA, nombre: '100000000000001', esGrupo: true };
  assert.equal(nombreMostrable(m, mapa), 'Ana Beltrán');
});

test('si el mensaje ya trae un nombre real y el contacto no está, se respeta', () => {
  assert.equal(nombreMostrable({ propio: false, autor: 'x@lid', nombre: 'Dana López' }, mapa), 'Dana López');
});

test('si no hay ningún nombre se dice claramente y se deja un rastro corto, no el número entero', () => {
  const m = { propio: false, autor: '555123456789@lid', nombre: '555123456789', esGrupo: true };
  assert.equal(nombreMostrable(m, mapa), 'Contacto sin nombre (…6789)');
  assert.equal(nombreMostrable({ propio: false, esGrupo: true }, mapa), 'Alguien del grupo');
});

test('un nombre del mapa que es solo un número no cuenta como nombre', () => {
  assert.equal(nombreMostrable({ propio: false, autor: '777888999@lid', nombre: '777888999' }, mapa), 'Contacto sin nombre (…8999)');
});

test('los mensajes propios conservan su nombre', () => {
  assert.equal(nombreMostrable({ propio: true, nombre: 'JP' }, mapa), 'JP');
  assert.equal(nombreMostrable({ propio: true }, mapa), 'Yo');
});

test('sin mapa funciona igual (Evolution caído)', () => {
  assert.equal(nombreMostrable({ propio: false, autor: ANA, nombre: '100000000000001' }, undefined), 'Contacto sin nombre (…0001)');
});

// ---------- menciones ----------

test('una mención @número se vuelve @nombre si el contacto se conoce, sea @lid o número', () => {
  const t = resolverMenciones('hay que ver con @100000000000001 y con @5215511111111 lo de @100000000000003', mapa);
  assert.equal(t, 'hay que ver con @Ana Beltrán y con @Carla Mendoza lo de @100000000000003');
});

test('lo que no es una mención de contacto no se toca', () => {
  assert.equal(resolverMenciones('escríbeme a @juan o llama al 5512345678', mapa), 'escríbeme a @juan o llama al 5512345678');
  assert.equal(resolverMenciones('@12345 corto', mapa), '@12345 corto');
  assert.equal(resolverMenciones(null, mapa), null);
});

// ---------- conNombres ----------

test('conNombres devuelve copias con nombres y menciones resueltos y no cambia el original', () => {
  const original = [{ id: '1', propio: false, autor: BETO, nombre: '100000000000002', texto: 'pásale a @100000000000001', esGrupo: true }];
  const [m] = conNombres(original, mapa);
  assert.equal(m.nombre, 'Beto Ríos');
  assert.equal(m.texto, 'pásale a @Ana Beltrán');
  assert.equal(original[0].nombre, '100000000000002');
  assert.equal(original[0].texto, 'pásale a @100000000000001');
});

// ---------- Evolution: el mapa de nombres ----------

test('mapaNombres lee los contactos y arma jid -> nombre sin las entradas sin nombre', async () => {
  const fetchFn = async (url, opts) => {
    assert.ok(url.endsWith('/chat/findContacts/i'));
    assert.equal(opts.method, 'POST');
    return { ok: true, status: 200, json: async () => [
      { remoteJid: ANA, pushName: 'Ana Beltrán' },
      { remoteJid: '5215511111111@s.whatsapp.net', pushName: 'Carla Mendoza' },
      { remoteJid: 'sin@lid', pushName: null },
      { remoteJid: 'vacio@lid', pushName: '' },
    ] };
  };
  const c = crearClienteEvolution({ url: 'http://evo', apiKey: 'K', instancia: 'i', fetchFn });
  const m = await c.mapaNombres();
  assert.equal(m.get(ANA), 'Ana Beltrán');
  assert.equal(m.get('5215511111111@s.whatsapp.net'), 'Carla Mendoza');
  assert.equal(m.has('sin@lid'), false);
  assert.equal(m.has('vacio@lid'), false);
});

// ---------- la conversación y el resumen usan los nombres ----------

async function montar() {
  const dir = await mkdtemp(join(tmpdir(), 'nombres-'));
  const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  await vigilados.activar(GRUPO);
  const almacen = new Almacen({ dir, vigilados });
  await almacen.guardar({ id: 'm1', chat: GRUPO, tipo: 'texto', texto: 'hay que ver con @100000000000001 el reglamento', fecha: new Date(2026, 10, 9, 12, 55).toISOString(), propio: false, nombre: '100000000000002', autor: BETO, esGrupo: true });
  return { dir, vigilados, almacen };
}

test('la conversación muestra el nombre y las menciones resueltas, y escapa el resultado', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    const manejar = crearConversacion({ almacen, vigilados, version: '1', nombres: async () => new Map([[BETO, 'Beto <b>Ríos</b>'], [ANA, 'Ana Beltrán']]) });
    const { html } = await manejar({ ruta: `/conversacion?chat=${encodeURIComponent(GRUPO)}&desde=2026-11-09&hasta=2026-11-09` });
    assert.match(html, /<span class="autor t\d">Beto &lt;b&gt;Ríos&lt;\/b&gt;<\/span>/);
    assert.ok(html.includes('hay que ver con @Ana Beltrán el reglamento'));
    assert.ok(!html.includes('100000000000002') && !html.includes('100000000000001'));
    assert.ok(!html.includes('<b>Ríos</b>'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('si no se pueden leer los nombres la conversación abre igual, con el rastro corto', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    const manejar = crearConversacion({ almacen, vigilados, version: '1', nombres: async () => { throw new Error('Evolution caído'); } });
    const r = await manejar({ ruta: `/conversacion?chat=${encodeURIComponent(GRUPO)}&desde=2026-11-09&hasta=2026-11-09` });
    assert.equal(r.estado, 200);
    assert.match(r.html, /Contacto sin nombre \(…0002\)/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el resumen le manda a Gemini los nombres de las personas, no sus números', async () => {
  const { dir, almacen, vigilados } = await montar();
  try {
    const cuerpos = [];
    const fetchFn = async (url, opts) => {
      cuerpos.push(opts.body);
      return { ok: true, status: 200, text: async () => '', json: async () => ({ candidates: [{ content: { parts: [{ text: '## Trabajo\n- ok' }] } }] }) };
    };
    await generarReporte({
      chat: GRUPO, desde: new Date(2026, 10, 9).toISOString(), hasta: new Date(2026, 10, 9, 23, 59).toISOString(),
      almacen, vigilados, medios: { apiKey: 'k', fetchFn }, dirReportes: join(dir, 'r'),
      nombres: async () => new Map([[BETO, 'Beto Ríos'], [ANA, 'Ana Beltrán']]),
    });
    const enviado = cuerpos.join('\n');
    assert.ok(enviado.includes('Beto Ríos: hay que ver con @Ana Beltrán el reglamento'), enviado.slice(0, 400));
    assert.ok(!enviado.includes('100000000000002') && !enviado.includes('100000000000001'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
