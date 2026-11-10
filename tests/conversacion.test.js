import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { renderConversacion, crearConversacion, POR_PAGINA } from '../src/conversacion.js';

const CHAT = '120363000000000001@g.us';
const PERSONA = '5215511111111@s.whatsapp.net';
const loc = (a, m, d, h = 0, min = 0) => new Date(a, m, d, h, min, 0, 0).toISOString();

const base = (extra = {}) => ({
  nombre: 'Bodega Norte', chat: CHAT, desde: loc(2026, 10, 9), hasta: loc(2026, 10, 9, 23, 59),
  total: 0, pagina: 1, totalPaginas: 1, version: '9.9.9', mensajes: [], ...extra,
});
const msg = (extra) => ({ id: 'M1', fecha: loc(2026, 10, 9, 19, 56), propio: false, nombre: 'Ana Beltrán', tipo: 'texto', texto: 'hola', esGrupo: true, ...extra });

// ---------- render ----------

test('la conversación titula con el nombre del chat, muestra el periodo, el conteo y vuelve al panel', () => {
  const html = renderConversacion(base({ total: 1, mensajes: [msg()] }));
  assert.match(html, /<h1>Bodega Norte<\/h1>/);
  assert.match(html, /<title>Bodega Norte<\/title>/);
  assert.ok(html.includes('lunes 9 de noviembre de 2026'));
  assert.match(html, /1 mensaje(?!s)/);
  assert.match(html, /<a class="volver" href="\/">[\s\S]*Volver al panel<\/a>/);
  assert.match(html, /v9\.9\.9/);
  assert.match(html, /Desarrollado por JP/);
});

test('cada mensaje lleva su hora local, separa los días y distingue lo propio de lo ajeno', () => {
  const html = renderConversacion(base({
    total: 3,
    mensajes: [
      msg({ id: 'A', fecha: loc(2026, 10, 8, 23, 5), texto: 'ayer tarde' }),
      msg({ id: 'B', fecha: loc(2026, 10, 9, 9, 7), texto: 'hoy', propio: true, nombre: 'Yo' }),
      msg({ id: 'C', fecha: loc(2026, 10, 9, 19, 56), texto: 'luego' }),
    ],
  }));
  assert.equal((html.match(/class="dia"/g) || []).length, 2, 'un separador por día');
  assert.ok(html.includes('domingo 8 de noviembre de 2026') && html.includes('lunes 9 de noviembre de 2026'));
  assert.match(html, /<time datetime="[^"]+">23:05<\/time>/);
  assert.match(html, /<time datetime="[^"]+">09:07<\/time>/);
  assert.match(html, /<li class="msg propio"[^>]*data-tipo="texto"/);
  assert.match(html, /<li class="msg ajeno"[^>]*data-tipo="texto"/);
});

test('en un grupo se muestra quién escribió, salvo en los mensajes propios', () => {
  const html = renderConversacion(base({
    total: 2,
    mensajes: [msg({ nombre: 'Ana Beltrán' }), msg({ id: 'B', propio: true, nombre: 'Yo' })],
  }));
  assert.match(html, /<span class="autor[^"]*">Ana Beltrán<\/span>/);
  assert.ok(!/<span class="autor[^"]*">Yo<\/span>/.test(html));
  const individual = renderConversacion(base({ chat: PERSONA, total: 1, mensajes: [msg({ esGrupo: undefined })] }));
  assert.ok(!individual.includes('class="autor'), 'en un chat individual no se repite el nombre en cada mensaje');
});

test('el texto, el autor y el título se escapan y los enlaces http se vuelven clicables sin abrir la puerta a otros esquemas', () => {
  const html = renderConversacion(base({
    nombre: 'Equipo <b>X</b>', total: 1,
    mensajes: [msg({ nombre: 'Ana <img src=x>', texto: 'mira <script>alert(1)</script> https://ejemplo.com/a?x=1&y=2 y javascript:alert(1)' })],
  }));
  assert.ok(!html.includes('<script>alert') && !html.includes('<img src=x>') && !html.includes('<b>X</b>'));
  assert.ok(html.includes('Equipo &lt;b&gt;X&lt;/b&gt;') && html.includes('Ana &lt;img src=x&gt;'));
  assert.match(html, /<a href="https:\/\/ejemplo\.com\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">/);
  assert.ok(!/<a href="javascript:/.test(html));
});

test('una imagen con archivo se ve y se abre; con pie de foto lo conserva', () => {
  const html = renderConversacion(base({
    total: 1, mensajes: [msg({ id: 'I1', tipo: 'imagen', texto: 'la factura', urlMedio: '/medios/I1' })],
  }));
  assert.match(html, /<a class="foto" href="\/medios\/I1" target="_blank" rel="noopener">\s*<img src="\/medios\/I1"[^>]*loading="lazy"/);
  assert.match(html, /alt="Imagen enviada por Ana Beltrán"/);
  assert.ok(html.includes('la factura'));
});

test('un audio con archivo trae reproductor con respaldo m4a y su transcripción si existe', () => {
  const html = renderConversacion(base({
    total: 1, mensajes: [msg({ id: 'A1', tipo: 'audio', texto: null, urlMedio: '/medios/A1', transcripcion: 'mándame la <factura>' })],
  }));
  assert.match(html, /<audio controls preload="none"[^>]*>\s*<source src="\/medios\/A1" type="audio\/ogg">\s*<source src="\/medios\/A1\.m4a" type="audio\/mp4">/);
  assert.match(html, /Transcripción/);
  assert.ok(html.includes('mándame la &lt;factura&gt;') && !html.includes('<factura>'));
});

test('lo anterior a la vigilancia o sin archivo se explica en vez de mostrar un reproductor roto', () => {
  const html = renderConversacion(base({
    total: 3,
    mensajes: [
      msg({ id: 'S1', tipo: 'audio', texto: null, sinMedio: true }),
      msg({ id: 'S2', tipo: 'imagen', texto: null, sinMedio: true }),
      msg({ id: 'S3', tipo: 'audio', texto: null }),
    ],
  }));
  assert.ok(!html.includes('<audio') && !html.includes('<img'));
  assert.equal((html.match(/Es de antes de vigilar este chat/g) || []).length, 2);
  assert.match(html, /<strong>Audio no disponible<\/strong>/);
  assert.match(html, /<strong>Imagen no disponible<\/strong>/);
  assert.match(html, /<strong>Archivo no disponible<\/strong>/);
  assert.equal((html.match(/class="sin-medio"/g) || []).length, 3);
});

test('trae buscador y filtros por tipo de mensaje', () => {
  const html = renderConversacion(base({ total: 1, mensajes: [msg()] }));
  assert.match(html, /<input[^>]*type="search"[^>]*id="buscar"/);
  for (const v of ['todo', 'imagen', 'audio']) {
    assert.match(html, new RegExp(`<input[^>]*type="radio"[^>]*name="tipo"[^>]*value="${v}"`));
  }
});

test('con varias páginas muestra la navegación y conserva el chat y las fechas en los enlaces', () => {
  const html = renderConversacion(base({ total: 700, pagina: 2, totalPaginas: 3, mensajes: [msg()] }));
  assert.match(html, /Página 2 de 3/);
  const enlaces = [...html.matchAll(/<a[^>]*class="pagina-enlace"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(enlaces.some((e) => e.includes('pagina=1')) && enlaces.some((e) => e.includes('pagina=3')));
  for (const e of enlaces) {
    assert.ok(e.includes('chat=' + encodeURIComponent(CHAT).replace(/&/g, '&amp;')) || e.includes('chat=' + encodeURIComponent(CHAT)), e);
    assert.ok(e.includes('desde=') && e.includes('hasta='));
  }
  const una = renderConversacion(base({ total: 1, mensajes: [msg()] }));
  assert.ok(!una.includes('class="pagina-enlace"'), 'con una sola página no hay enlaces de navegación');
});

test('sin mensajes explica que no hay nada guardado en ese periodo', () => {
  const html = renderConversacion(base());
  assert.match(html, /No hay mensajes guardados de este chat en ese periodo/);
});

// ---------- manejador ----------

async function montar() {
  const dir = await mkdtemp(join(tmpdir(), 'conv-'));
  const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  await vigilados.activar(CHAT);
  const almacen = new Almacen({ dir, vigilados });
  const manejar = crearConversacion({ almacen, vigilados, nombrePara: async () => 'Bodega Norte', version: '1.2.3' });
  return { dir, almacen, vigilados, manejar };
}
const q = (o) => '/conversacion?' + new URLSearchParams(o).toString();

test('el manejador rechaza un chat no vigilado antes de leer nada', async () => {
  const { dir, manejar } = await montar();
  try {
    const r = await manejar({ ruta: q({ chat: PERSONA, desde: '2026-11-09', hasta: '2026-11-09' }) });
    assert.equal(r.estado, 403);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el manejador pide chat y rechaza fechas inválidas', async () => {
  const { dir, manejar } = await montar();
  try {
    assert.equal((await manejar({ ruta: '/conversacion' })).estado, 400);
    assert.equal((await manejar({ ruta: q({ chat: CHAT, desde: 'ayer', hasta: '2026-11-09' }) })).estado, 400);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el manejador devuelve los mensajes del día pedido, con nombre y en orden', async () => {
  const { dir, almacen, manejar } = await montar();
  try {
    await almacen.guardar({ id: 'a', chat: CHAT, tipo: 'texto', texto: 'segundo', fecha: loc(2026, 10, 9, 10), propio: false, nombre: 'Ana', esGrupo: true });
    await almacen.guardar({ id: 'b', chat: CHAT, tipo: 'texto', texto: 'primero', fecha: loc(2026, 10, 9, 8), propio: false, nombre: 'Beto', esGrupo: true });
    await almacen.guardar({ id: 'c', chat: CHAT, tipo: 'texto', texto: 'otro día', fecha: loc(2026, 10, 8, 8), propio: false, nombre: 'Ana', esGrupo: true });
    const r = await manejar({ ruta: q({ chat: CHAT, desde: '2026-11-09', hasta: '2026-11-09' }) });
    assert.equal(r.estado, 200);
    assert.match(r.html, /<h1>Bodega Norte<\/h1>/);
    assert.ok(r.html.indexOf('primero') < r.html.indexOf('segundo'));
    assert.ok(!r.html.includes('otro día'));
    assert.match(r.html, /2 mensajes/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el manejador acepta fechas ISO (así las manda el reporte)', async () => {
  const { dir, almacen, manejar } = await montar();
  try {
    await almacen.guardar({ id: 'a', chat: CHAT, tipo: 'texto', texto: 'dentro', fecha: loc(2026, 10, 9, 10), propio: false, nombre: 'Ana', esGrupo: true });
    const r = await manejar({ ruta: q({ chat: CHAT, desde: loc(2026, 10, 9), hasta: loc(2026, 10, 9, 23, 59) }) });
    assert.equal(r.estado, 200);
    assert.ok(r.html.includes('dentro'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el manejador enlaza los archivos que existen y lee la transcripción guardada', async () => {
  const { dir, almacen, manejar } = await montar();
  try {
    await almacen.guardar({ id: 'au', chat: CHAT, tipo: 'audio', texto: null, mediaId: 'AUD1', mimetype: 'audio/ogg; codecs=opus', fecha: loc(2026, 10, 9, 9), propio: false, nombre: 'Ana', esGrupo: true });
    await almacen.guardar({ id: 'im', chat: CHAT, tipo: 'imagen', texto: 'foto', mediaId: 'IMG1', mimetype: 'image/jpeg', fecha: loc(2026, 10, 9, 9, 1), propio: false, nombre: 'Ana', esGrupo: true });
    await almacen.guardar({ id: 'ya', chat: CHAT, tipo: 'audio', texto: null, mediaId: 'FALTA', mimetype: 'audio/ogg', fecha: loc(2026, 10, 9, 9, 2), propio: false, nombre: 'Ana', esGrupo: true });
    const ruta = await almacen.guardarMedio({ chat: CHAT, mediaId: 'AUD1', mimetype: 'audio/ogg', buffer: Buffer.from('x') });
    await almacen.guardarMedio({ chat: CHAT, mediaId: 'IMG1', mimetype: 'image/jpeg', buffer: Buffer.from('y') });
    await writeFile(ruta + '.txt', 'necesito la cotización');
    const r = await manejar({ ruta: q({ chat: CHAT, desde: '2026-11-09', hasta: '2026-11-09' }) });
    assert.ok(r.html.includes('src="/medios/AUD1"') && r.html.includes('src="/medios/IMG1"'));
    assert.ok(r.html.includes('necesito la cotización'));
    assert.match(r.html, /Archivo no disponible/);
    assert.ok(!r.html.includes('/medios/FALTA'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el manejador pagina de a POR_PAGINA mensajes y respeta el número de página', async () => {
  const { dir, almacen, manejar } = await montar();
  try {
    const total = POR_PAGINA + 5;
    const lote = Array.from({ length: total }, (_, i) => ({
      id: `m${i}`, chat: CHAT, tipo: 'texto', texto: `mensaje-${String(i).padStart(4, '0')}`,
      fecha: new Date(2026, 10, 9, 0, 0, i).toISOString(), propio: false, nombre: 'Ana', esGrupo: true,
    }));
    await almacen.guardarLote(lote);
    const uno = await manejar({ ruta: q({ chat: CHAT, desde: '2026-11-09', hasta: '2026-11-09' }) });
    assert.equal((uno.html.match(/class="msg /g) || []).length, POR_PAGINA);
    assert.match(uno.html, /Página 1 de 2/);
    const dos = await manejar({ ruta: q({ chat: CHAT, desde: '2026-11-09', hasta: '2026-11-09', pagina: '2' }) });
    assert.equal((dos.html.match(/class="msg /g) || []).length, 5);
    assert.ok(dos.html.includes('mensaje-' + String(total - 1).padStart(4, '0')));
    const fuera = await manejar({ ruta: q({ chat: CHAT, desde: '2026-11-09', hasta: '2026-11-09', pagina: '99' }) });
    assert.match(fuera.html, /Página 2 de 2/, 'una página inexistente cae a la última');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- volver al resumen ----------

test('con un reporte de origen la conversación ofrece "Ver resumen" y lo conserva al paginar', () => {
  const html = renderConversacion(base({ total: 700, pagina: 2, totalPaginas: 3, mensajes: [msg()], reporte: 'abc-123' }));
  assert.match(html, /<a class="boton-enlace" href="\/reportes\/abc-123">[\s\S]*Ver resumen<\/a>/);
  const enlaces = [...html.matchAll(/<a[^>]*class="pagina-enlace"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(enlaces.length >= 2);
  for (const e of enlaces) assert.ok(e.includes('reporte=abc-123'), e);
  const sin = renderConversacion(base({ total: 1, mensajes: [msg()] }));
  assert.doesNotMatch(sin, /<a class="boton-enlace" href="\/reportes\//, 'sin reporte de origen no hay botón');
});

test('un reporte de origen que no existe o tiene un id raro no genera un enlace roto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'conv-rep-'));
  try {
    const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
    await vigilados.activar(CHAT);
    const almacen = new Almacen({ dir, vigilados });
    const dirReportes = join(dir, 'reportes');
    await import('node:fs/promises').then((fs) => fs.mkdir(dirReportes, { recursive: true }));
    await writeFile(join(dirReportes, 'real-1.html'), '<p>resumen</p>');
    const manejar = crearConversacion({ almacen, vigilados, dirReportes, version: '1' });
    const pedir = (reporte) => manejar({ ruta: q({ chat: CHAT, desde: '2026-11-09', hasta: '2026-11-09', reporte }) });
    assert.match((await pedir('real-1')).html, /href="\/reportes\/real-1"/);
    assert.doesNotMatch((await pedir('no-existe')).html, /<a class="boton-enlace" href="\/reportes\//);
    for (const raro of ['../vigilados', 'a/b', 'A B', '<script>alert(1)</script>']) {
      const r = await pedir(raro);
      assert.equal(r.estado, 200);
      assert.doesNotMatch(r.html, /<a class="boton-enlace" href="\/reportes\//, raro);
      assert.ok(!r.html.includes(raro), raro);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('si el reporte viene de una página anterior sin id en la dirección, la conversación lo recupera del referente', () => {
  const html = renderConversacion(base({ total: 1, mensajes: [msg()] }));
  assert.match(html, /document\.referrer/);
  assert.match(html, /\/reportes\/\[a-z0-9-\]\+/);
});
