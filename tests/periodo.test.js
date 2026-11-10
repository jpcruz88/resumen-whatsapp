import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaPeriodo } from '../src/fechas.js';

const ini = (a, m, d) => new Date(a, m, d, 0, 0, 0, 0).toISOString();
const fin = (a, m, d) => new Date(a, m, d, 23, 59, 59, 999).toISOString();

test('un solo día se escribe completo, en español', () => {
  assert.equal(etiquetaPeriodo(ini(2026, 10, 9), fin(2026, 10, 9)), 'lunes 9 de noviembre de 2026');
});

test('un rango del mismo año omite el año del inicio', () => {
  assert.equal(etiquetaPeriodo(ini(2026, 10, 3), fin(2026, 10, 9)), '3 de noviembre al 9 de noviembre de 2026');
});

test('un rango que cruza de año lleva el año en las dos puntas', () => {
  assert.equal(etiquetaPeriodo(ini(2025, 11, 30), fin(2026, 0, 2)), '30 de diciembre de 2025 al 2 de enero de 2026');
});

test('si no son fechas válidas devuelve el texto tal cual, sin romperse', () => {
  assert.equal(etiquetaPeriodo('ayer', 'hoy'), 'ayer a hoy');
  assert.equal(etiquetaPeriodo(undefined, undefined), '');
});
