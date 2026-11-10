import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conCache } from '../src/cache.js';

// Reloj falso para no depender del tiempo real.
function reloj() {
  let t = 1000;
  return { ahora: () => t, avanzar: (ms) => { t += ms; } };
}
const pausa = () => new Promise((r) => setImmediate(r));

test('la primera llamada espera al origen y las siguientes dentro del plazo no lo vuelven a llamar', async () => {
  const r = reloj();
  let llamadas = 0;
  const f = conCache(async () => ++llamadas, { ttlMs: 100, ahora: r.ahora });
  assert.equal(await f(), 1);
  r.avanzar(50);
  assert.equal(await f(), 1);
  assert.equal(llamadas, 1);
});

test('varias llamadas a la vez comparten una sola consulta al origen', async () => {
  let llamadas = 0;
  let soltar;
  const f = conCache(() => new Promise((res) => { llamadas++; soltar = () => res('lista'); }), { ttlMs: 100 });
  const a = f(); const b = f(); const c = f();
  soltar();
  assert.deepEqual(await Promise.all([a, b, c]), ['lista', 'lista', 'lista']);
  assert.equal(llamadas, 1);
});

test('vencida la caché se responde al instante con lo anterior y se renueva por detrás', async () => {
  const r = reloj();
  let llamadas = 0;
  const f = conCache(async () => ++llamadas, { ttlMs: 100, ahora: r.ahora });
  assert.equal(await f(), 1);
  r.avanzar(500);
  assert.equal(await f(), 1, 'sirve el valor viejo sin esperar');
  await pausa();
  assert.equal(await f(), 2, 'la siguiente ya trae el valor renovado');
  assert.equal(llamadas, 2);
});

test('si la renovación falla se sigue sirviendo el último valor bueno', async () => {
  const r = reloj();
  let llamadas = 0;
  const f = conCache(async () => { llamadas++; if (llamadas > 1) throw new Error('Evolution caído'); return 'bueno'; }, { ttlMs: 100, ahora: r.ahora });
  assert.equal(await f(), 'bueno');
  r.avanzar(500);
  assert.equal(await f(), 'bueno');
  await pausa();
  assert.equal(await f(), 'bueno');
});

test('si la primera carga falla el error llega a quien llamó y la siguiente vuelve a intentar', async () => {
  let llamadas = 0;
  const f = conCache(async () => { llamadas++; if (llamadas === 1) throw new Error('sin conexión'); return 'ya'; }, { ttlMs: 100 });
  await assert.rejects(f(), /sin conexión/);
  assert.equal(await f(), 'ya');
});

test('precalentar carga el valor sin esperar a la primera petición', async () => {
  let llamadas = 0;
  const f = conCache(async () => ++llamadas, { ttlMs: 100 });
  f.precalentar();
  await pausa();
  assert.equal(await f(), 1);
  assert.equal(llamadas, 1);
});
