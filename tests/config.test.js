import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerConfig } from '../src/config.js';
import { main } from '../src/cli.js';

const ENV = {
  SECRETO_WEBHOOK: 's3',
  GEMINI_API_KEY: 'gk',
  GEMINI_MODEL: 'gemini-x',
  DATOS_DIR: '/tmp/d',
  PUERTO: '3200',
  EVOLUTION_API_URL: 'http://127.0.0.1:8080',
  EVOLUTION_API_KEY: 'ek',
  EVOLUTION_INSTANCE: 'inst',
};

test('leerConfig devuelve el objeto con todas las variables', () => {
  assert.deepEqual(leerConfig(ENV), {
    puerto: 3200,
    datosDir: '/tmp/d',
    secreto: 's3',
    geminiKey: 'gk',
    geminiModel: 'gemini-x',
    panelHosts: [],
    evolution: { url: 'http://127.0.0.1:8080', apiKey: 'ek', instancia: 'inst' },
  });
});

test('leerConfig aplica valores por omisión y lee PANEL_HOSTS', () => {
  const { SECRETO_WEBHOOK, GEMINI_API_KEY, EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE } = ENV;
  const c = leerConfig({ SECRETO_WEBHOOK, GEMINI_API_KEY, EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, PANEL_HOSTS: 'a.dev, b.dev' });
  assert.equal(c.puerto, 3100);
  assert.equal(c.datosDir, './datos');
  assert.equal(c.geminiModel, 'gemini-3.1-flash-lite');
  assert.deepEqual(c.panelHosts, ['a.dev', 'b.dev']);
});

for (const falta of ['SECRETO_WEBHOOK', 'GEMINI_API_KEY', 'EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE']) {
  test(`leerConfig sin ${falta} lanza error que la nombra`, () => {
    const env = { ...ENV };
    delete env[falta];
    assert.throws(() => leerConfig(env), (e) => e.message.includes(falta));
  });
}

test('leerConfig rechaza PUERTO inválido', () => {
  assert.throws(() => leerConfig({ ...ENV, PUERTO: 'abc' }), /PUERTO/);
});

test('cli llama generarReporte y devuelve la URL local', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cli-'));
  try {
    const llamadas = [];
    const url = await main(
      ['--chat', 'x@s.whatsapp.net', '--desde', '2026-11-02', '--hasta', '2026-11-09'],
      { ...ENV, DATOS_DIR: dir },
      { generarReporte: async (a) => { llamadas.push(a); return { id: 'abc-1', url: '/reportes/abc-1' }; } },
    );
    assert.equal(url, 'http://127.0.0.1:3200/reportes/abc-1');
    assert.equal(llamadas[0].chat, 'x@s.whatsapp.net');
    assert.equal(llamadas[0].desde, new Date(2026, 10, 2, 0, 0, 0, 0).toISOString());
    assert.equal(llamadas[0].hasta, new Date(2026, 10, 9, 23, 59, 59, 999).toISOString());
    assert.equal(llamadas[0].dirReportes, join(dir, 'reportes'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cli sin --chat lanza error', async () => {
  await assert.rejects(() => main([], ENV, {}), /--chat/);
});
