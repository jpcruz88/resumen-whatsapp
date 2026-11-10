import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sospechosos } from '../scripts/privacidad.mjs';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));

// Ejemplos de lo que SÍ debe detectarse, armados al ejecutar para que no queden escritos como números largos
// en el archivo (si no, esta misma revisión los marcaría).
const ID_PERSONA = ['19999', '9999999999'].join(''); // 15 dígitos
const ID_GRUPO = ['120363', '99999', '9999999'].join(''); // 18 dígitos
const TELEFONO = ['52155', '00000000'].join(''); // 13 dígitos

test('un número largo que no es de los inventados se marca como sospechoso', () => {
  assert.deepEqual(sospechosos(`un id ${ID_PERSONA} real`), [ID_PERSONA]);
  assert.deepEqual(sospechosos(`grupo ${ID_GRUPO}@g.us`), [ID_GRUPO]);
  assert.deepEqual(sospechosos(`teléfono ${TELEFONO}`), [TELEFONO]);
});

test('los números inventados que usan las pruebas no se marcan', () => {
  const ok = '5215511111111 5215522222222 5215533333333 5215599999999 5215512345678 111111111111111 222222222222222 '
    + '900000000000001 100000000000001 100000000000003 120363000000000001 120363000000000009';
  assert.deepEqual(sospechosos(ok), []);
});

test('los números de menos de 12 dígitos (fechas, marcas de tiempo) no se marcan', () => {
  assert.deepEqual(sospechosos('1762646400 20261109 52155500000'), []);
});

test('ningún archivo del repositorio trae números largos que parezcan identificadores reales', () => {
  const archivos = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);
  const texto = new Set(['.js', '.mjs', '.md', '.json', '.yml', '.yaml', '.txt', '.html', '.example']);
  const hallazgos = [];
  for (const rel of archivos) {
    // Único archivo no revisado: define la lista de inventados, así que sus patrones llevan esos números.
    if (rel === 'scripts/privacidad.mjs') continue;
    if (!texto.has(extname(rel)) && !rel.endsWith('.env.example')) continue;
    let contenido;
    try { contenido = readFileSync(join(RAIZ, rel), 'utf8'); } catch { continue; }
    for (const n of sospechosos(contenido)) hallazgos.push(`${rel}: ${n}`);
  }
  assert.deepEqual(hallazgos, [], 'Hay números que parecen identificadores reales; usa uno inventado.');
});
