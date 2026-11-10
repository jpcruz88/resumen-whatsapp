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

test('desdeDe da la hora en que se empezó a vigilar y activar otra vez no la cambia', () =>
  conTmp(async (vig) => {
    assert.equal(await vig.desdeDe(A), null);
    const antes = Date.now();
    await vig.activar(A);
    const t1 = Date.parse(await vig.desdeDe(A));
    assert.ok(t1 >= antes && t1 <= Date.now());
    await new Promise((r) => setTimeout(r, 15));
    await vig.activar(A);
    assert.equal(Date.parse(await vig.desdeDe(A)), t1);
  }));

test('al dejar de vigilar se olvida la hora y al volver a vigilar empieza una nueva', () =>
  conTmp(async (vig) => {
    await vig.activar(A);
    await vig.desactivar(A);
    assert.equal(await vig.desdeDe(A), null);
    await vig.activar(A);
    assert.notEqual(await vig.desdeDe(A), null);
  }));

test('un archivo del formato anterior (sin hora) sigue funcionando y da null', async () => {
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'vigilados-'));
  try {
    const archivo = join(dir, 'vigilados.json');
    await writeFile(archivo, JSON.stringify({ chats: [A] }));
    const vig = new Vigilados({ archivo });
    assert.equal(await vig.esVigilado(A), true);
    assert.equal(await vig.desdeDe(A), null);
    await vig.activar('otro@s.whatsapp.net');
    assert.deepEqual(await vig.lista(), [A, 'otro@s.whatsapp.net']);
    assert.equal(await vig.desdeDe(A), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
