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
    markdown: '## Trabajo\n- x', mensajes: 3,
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('name="viewport"'));
  assert.ok(html.includes('prefers-color-scheme'));
  assert.ok(html.includes('A&quot;B'));
  // Sin nombre, el título cae al identificador del chat, escapado.
  const sinNombre = renderReporte({ chat: '<b>Grupo</b>', markdown: '## Trabajo', mensajes: 1 });
  assert.ok(sinNombre.includes('&lt;b&gt;Grupo&lt;/b&gt;'));
  assert.ok(!sinNombre.includes('<b>Grupo</b>'));
});

test('renderReporte titula con el nombre, no con el id; el periodo sale legible y no en ISO', () => {
  const html = renderReporte({
    chat: '120363000000000009@g.us', nombre: 'Bodega Norte',
    desde: new Date(2026, 10, 9, 0, 0, 0, 0).toISOString(), hasta: new Date(2026, 10, 9, 23, 59, 59, 999).toISOString(),
    markdown: '## Trabajo\n- x', mensajes: 5,
  });
  assert.match(html, /<h1>Bodega Norte<\/h1>/);
  assert.match(html, /<title>Bodega Norte<\/title>/);
  assert.ok(!html.includes('<h1>120363000000000009@g.us</h1>'));
  assert.ok(html.includes('lunes 9 de noviembre de 2026'));
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(html), 'no debe mostrar fechas ISO');
  assert.match(html, /5 mensajes/);
});

test('renderReporte con un solo mensaje dice "1 mensaje"', () => {
  const html = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '## Trabajo', mensajes: 1 });
  assert.match(html, /1 mensaje(?!s)/);
});

test('renderReporte sin mensajes en el periodo dice de qué fechas sí hay mensajes guardados', () => {
  const html = renderReporte({
    chat: 'a@g.us', nombre: 'Bodega Norte', markdown: 'No hay mensajes en ese periodo.', mensajes: 0,
    guardados: { primero: new Date(2026, 6, 29, 10).toISOString(), ultimo: new Date(2026, 10, 9, 19).toISOString() },
  });
  assert.match(html, /No hay mensajes guardados de este chat en ese periodo/);
  assert.match(html, /Este chat tiene mensajes guardados del 29 de julio al 9 de noviembre de 2026\. Prueba con otro periodo\./);
  assert.ok(!html.includes('Se empezó a vigilar'), 'ya no afirma que solo se guarda desde que se vigila');
});

test('renderReporte sin mensajes en todo el chat explica que los nuevos se guardan al llegar', () => {
  const html = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '', mensajes: 0, guardados: null });
  assert.match(html, /No hay mensajes guardados de este chat en ese periodo/);
  assert.match(html, /Todavía no hay ningún mensaje guardado de este chat\. Los que lleguen se guardan solos\./);
});

test('renderReporte con mensajes muestra el resumen y no la nota de vacío', () => {
  const html = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '## Trabajo\n- entregar copias', mensajes: 2 });
  assert.match(html, /<li>entregar copias<\/li>/);
  assert.ok(!html.includes('No hay mensajes guardados'));
});

test('renderReporte lleva el enlace de vuelta al panel y el pie con versión', () => {
  const html = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '## Trabajo', mensajes: 1, version: '9.8.7' });
  assert.match(html, /<a class="volver" href="\/">[\s\S]*Volver al panel<\/a>/);
  const pie = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
  assert.ok(pie && pie[1].includes('v9.8.7') && pie[1].includes('Desarrollado por JP'));
  assert.ok(!html.includes('<script'), 'el reporte no lleva scripts');
});

test('renderReporte trae estilo de impresión y respeta el modo oscuro', () => {
  const html = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '## Trabajo', mensajes: 1 });
  assert.match(html, /@media print/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
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

test('renderReporte sin mensajes no mete el aviso dentro de otra tarjeta', () => {
  const vacio = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '', mensajes: 0 });
  assert.match(vacio, /<main class="contenido sin-tarjeta">/);
  const lleno = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '## Trabajo', mensajes: 2 });
  assert.match(lleno, /<main class="contenido">/);
});

test('renderReporte enlaza a la conversación del mismo periodo', () => {
  const html = renderReporte({
    chat: 'a@g.us', nombre: 'X', markdown: '## Trabajo', mensajes: 2,
    enlaceConversacion: '/conversacion?chat=a%40g.us&desde=D&hasta=H',
  });
  assert.match(html, /<a class="boton-enlace" href="\/conversacion\?chat=a%40g\.us&amp;desde=D&amp;hasta=H">[\s\S]*Ver conversación<\/a>/);
  const sin = renderReporte({ chat: 'a@g.us', nombre: 'X', markdown: '## Trabajo', mensajes: 2 });
  assert.ok(!sin.includes('Ver conversación'));
});

test('markdownAHtml vuelve etiqueta la fecha que cita cada tarea y deja intacto lo demás', () => {
  const html = markdownAHtml('- Enviar la cotización, pedida por Ana el [2026-11-09 09:12].\n- Sin fecha [x] ni [2026-13-45 99:99]');
  assert.match(html, /<time class="cita" datetime="2026-11-09T09:12">9 nov, 09:12<\/time>/);
  assert.ok(!html.includes('[2026-11-09 09:12]'));
  assert.ok(html.includes('[x]'), 'otros corchetes no se tocan');
  assert.ok(!/<time[^>]*2026-13-45/.test(html), 'una fecha imposible no se convierte');
  const hostil = markdownAHtml('- <b>[2026-11-09 09:12]</b>');
  assert.ok(hostil.includes('&lt;b&gt;') && !hostil.includes('<b>'));
});

test('nuevoIdReporte da un id válido y distinto cada vez', async () => {
  const { nuevoIdReporte } = await import('../src/reporte.js');
  const a = nuevoIdReporte();
  const b = nuevoIdReporte();
  assert.match(a, /^[a-z0-9-]{8,60}$/);
  assert.notEqual(a, b);
});

test('guardarReporte usa el id que se le da, para poder enlazarlo antes de escribirlo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rep-'));
  try {
    const id = await guardarReporte({ dir, html: '<p>x</p>', id: 'abc-123' });
    assert.equal(id, 'abc-123');
    assert.equal(await readFile(join(dir, 'abc-123.html'), 'utf8'), '<p>x</p>');
    await assert.rejects(guardarReporte({ dir, html: '<p>y</p>', id: 'abc-123' }), /existe/, 'no pisa un reporte existente');
    for (const malo of ['../x', 'a/b', 'A-1', '', 'a b', 'x'.repeat(80)]) {
      await assert.rejects(guardarReporte({ dir, html: '<p>z</p>', id: malo }), /id/, `rechaza ${JSON.stringify(malo)}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('markdownAHtml convierte **negritas** y *cursivas* sin dejar asteriscos y sin abrir la puerta a HTML', () => {
  const html = markdownAHtml('- **Reporte de NIP:** Rokiloki envió la lista [2026-11-10 13:22]\n- texto con *énfasis* y **(?)** al final\n- <b>**x**</b> y 2 * 3 * 4');
  assert.ok(html.includes('<li><strong>Reporte de NIP:</strong> Rokiloki envió la lista <time class="cita"'), html);
  assert.ok(html.includes('<em>énfasis</em>') && html.includes('<strong>(?)</strong>'));
  assert.ok(html.includes('&lt;b&gt;<strong>x</strong>&lt;/b&gt;'), 'el HTML ajeno sigue escapado');
  assert.ok(html.includes('2 * 3 * 4'), 'un asterisco suelto no se toca');
  assert.ok(!/\*\*/.test(html.replace('2 * 3 * 4', '')), 'no quedan ** sueltos');
});

test('markdownAHtml reconoce las viñetas con negrita al inicio como etiqueta del punto', () => {
  const html = markdownAHtml('- **Normativa:** Se implementó la detección');
  assert.match(html, /<li><strong class="etiqueta">Normativa:<\/strong> Se implementó la detección<\/li>|<li><strong>Normativa:<\/strong> Se implementó/);
});
