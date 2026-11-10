import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vigilados } from '../src/vigilados.js';

const A = '5215511111111@s.whatsapp.net';

async function conTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'vigilados-'));
  try {
    await fn(new Vigilados({ archivo: join(dir, 'vigilados.json') }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('activar y desactivar cambian esVigilado', () =>
  conTmp(async (v) => {
    await v.activar(A);
    assert.equal(await v.esVigilado(A), true);
    await v.desactivar(A);
    assert.equal(await v.esVigilado(A), false);
  }));

test('activar dos veces no duplica', () =>
  conTmp(async (v) => {
    await v.activar(A);
    await v.activar(A);
    assert.deepEqual(await v.lista(), [A]);
  }));

test('archivo inexistente da lista vacía', () =>
  conTmp(async (v) => {
    assert.deepEqual(await v.lista(), []);
    assert.equal(await v.esVigilado(A), false);
  }));
