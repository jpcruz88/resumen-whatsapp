import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escaparHtml, markdownAHtml, renderReporte, guardarReporte } from '../src/reporte.js';

test('escaparHtml escapa & < > " \'', () => {
  assert.equal(escaparHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('markdownAHtml escapa script antes de convertir', () => {
  const html = markdownAHtml('- <script>alert(1)</script>');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('markdownAHtml convierte encabezados, listas y parrafos', () => {
  const html = markdownAHtml('## Trabajo\n### Temas\n- uno\n- dos\n\nTexto libre');
  assert.ok(html.includes('<h2>Trabajo</h2>'));
  assert.ok(html.includes('<h3>Temas</h3>'));
  assert.ok(html.includes('<ul><li>uno</li><li>dos</li></ul>'));
  assert.ok(html.includes('<p>Texto libre</p>'));
});

test('renderReporte produce documento completo y escapa metadatos', () => {
  const html = renderReporte({
    chat: '<b>Grupo</b>', nombre: 'A"B', desde: '2026-11-01', hasta: '2026-11-09',
    markdown: '## Trabajo\n- x',
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('name="viewport"'));
  assert.ok(html.includes('prefers-color-scheme'));
  assert.ok(html.includes('&lt;b&gt;Grupo&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Grupo</b>'));
  assert.ok(html.includes('A&quot;B'));
});

test('guardarReporte escribe dir/<id>.html', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rep-'));
  try {
    const id = await guardarReporte({ dir, html: '<p>hola</p>' });
    assert.match(id, /^[a-z0-9-]+$/);
    await access(join(dir, `${id}.html`));
    assert.equal(await readFile(join(dir, `${id}.html`), 'utf8'), '<p>hola</p>');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
