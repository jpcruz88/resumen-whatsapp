import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { crearMedios } from '../src/medios-http.js';
import { crearServidorHttp, crearRouter } from '../src/servidor.js';
import { convertirAM4a, buscarFfmpeg } from '../src/audio.js';
import { etiquetaDia } from '../src/fechas.js';

const CHAT = '120363000000000001@g.us';

async function montar({ convertir } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'medios-'));
  const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  await vigilados.activar(CHAT);
  const almacen = new Almacen({ dir, vigilados });
  const medios = crearMedios({ almacen, convertir });
  return { dir, almacen, medios };
}
const get = (medios, ruta, cabeceras = {}) => medios({ metodo: 'GET', ruta, cabeceras });

// ---------- manejador de medios ----------

test('sirve una imagen y un audio con su tipo y sin dejar que el navegador adivine', async () => {
  const { dir, almacen, medios } = await montar();
  try {
    await almacen.guardarMedio({ chat: CHAT, mediaId: 'IMG1', mimetype: 'image/jpeg', buffer: Buffer.from('jpg') });
    await almacen.guardarMedio({ chat: CHAT, mediaId: 'AUD1', mimetype: 'audio/ogg; codecs=opus', buffer: Buffer.from('ogg') });
    const i = await get(medios, '/medios/IMG1');
    assert.equal(i.estado, 200);
    assert.equal(i.archivo.tipo, 'image/jpeg');
    assert.equal(await readFile(i.archivo.ruta, 'utf8'), 'jpg');
    const a = await get(medios, '/medios/AUD1');
    assert.equal(a.archivo.tipo, 'audio/ogg');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('un id que no existe, o que intenta salirse de la carpeta, responde 404', async () => {
  const { dir, medios } = await montar();
  try {
    for (const ruta of ['/medios/NOEXISTE', '/medios/..%2F..%2Fvigilados', '/medios/../vigilados.json', '/medios/a%00b', '/medios/', '/medios/x/y']) {
      assert.equal((await get(medios, ruta)).estado, 404, ruta);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el audio .m4a se convierte una sola vez, se guarda y se reutiliza', async () => {
  let conversiones = 0;
  const convertir = async (origen, destino) => { conversiones++; await writeFile(destino, 'm4a-' + (await readFile(origen, 'utf8'))); };
  const { dir, almacen, medios } = await montar({ convertir });
  try {
    await almacen.guardarMedio({ chat: CHAT, mediaId: 'AUD1', mimetype: 'audio/ogg', buffer: Buffer.from('ogg') });
    const a = await get(medios, '/medios/AUD1.m4a');
    assert.equal(a.estado, 200);
    assert.equal(a.archivo.tipo, 'audio/mp4');
    assert.equal(await readFile(a.archivo.ruta, 'utf8'), 'm4a-ogg');
    await get(medios, '/medios/AUD1.m4a');
    assert.equal(conversiones, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('sin convertidor, o si la conversión falla, el .m4a responde 404 y no deja basura', async () => {
  const sin = await montar();
  const falla = await montar({ convertir: async (o, destino) => { await writeFile(destino, 'a medias'); throw new Error('ffmpeg falló'); } });
  try {
    await sin.almacen.guardarMedio({ chat: CHAT, mediaId: 'AUD1', mimetype: 'audio/ogg', buffer: Buffer.from('ogg') });
    assert.equal((await get(sin.medios, '/medios/AUD1.m4a')).estado, 404);
    await falla.almacen.guardarMedio({ chat: CHAT, mediaId: 'AUD1', mimetype: 'audio/ogg', buffer: Buffer.from('ogg') });
    assert.equal((await get(falla.medios, '/medios/AUD1.m4a')).estado, 404);
    await assert.rejects(access(join(falla.dir, 'media', 'conv', 'AUD1.m4a')), 'no se queda el archivo a medias');
  } finally {
    await rm(sin.dir, { recursive: true, force: true });
    await rm(falla.dir, { recursive: true, force: true });
  }
});

test('el .m4a de algo que no es audio responde 404', async () => {
  const { dir, almacen, medios } = await montar({ convertir: async () => { throw new Error('no debe llamarse'); } });
  try {
    await almacen.guardarMedio({ chat: CHAT, mediaId: 'IMG1', mimetype: 'image/png', buffer: Buffer.from('png') });
    assert.equal((await get(medios, '/medios/IMG1.m4a')).estado, 404);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- servidor HTTP: archivos con Range ----------

function pedir(port, path, cabeceras = {}) {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, method: 'GET', path, headers: cabeceras }, (res) => {
      const trozos = [];
      res.on('data', (c) => trozos.push(c));
      res.on('end', () => resolve({ estado: res.statusCode, cabeceras: res.headers, cuerpo: Buffer.concat(trozos) }));
    }).on('error', reject).end();
  });
}

async function conArchivo(contenido, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'rango-'));
  const ruta = join(dir, 'a.ogg');
  await writeFile(ruta, contenido);
  const servidor = crearServidorHttp({ manejar: async () => ({ estado: 200, archivo: { ruta, tipo: 'audio/ogg' } }) });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  try { await fn(servidor.address().port); } finally {
    servidor.closeAllConnections?.();
    await new Promise((r) => servidor.close(r));
    await rm(dir, { recursive: true, force: true });
  }
}

test('un archivo completo se sirve con su tipo, su tamaño y se anuncia que admite rangos', () =>
  conArchivo('0123456789', async (port) => {
    const r = await pedir(port, '/x');
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.toString(), '0123456789');
    assert.equal(r.cabeceras['content-type'], 'audio/ogg');
    assert.equal(r.cabeceras['content-length'], '10');
    assert.equal(r.cabeceras['accept-ranges'], 'bytes');
    assert.equal(r.cabeceras['x-content-type-options'], 'nosniff');
    assert.match(r.cabeceras['cache-control'], /private/);
  }));

test('una petición con Range devuelve solo ese trozo (Safari lo exige para reproducir audio)', () =>
  conArchivo('0123456789', async (port) => {
    const r = await pedir(port, '/x', { range: 'bytes=2-5' });
    assert.equal(r.estado, 206);
    assert.equal(r.cuerpo.toString(), '2345');
    assert.equal(r.cabeceras['content-range'], 'bytes 2-5/10');
    assert.equal(r.cabeceras['content-length'], '4');
    const resto = await pedir(port, '/x', { range: 'bytes=7-' });
    assert.equal(resto.cuerpo.toString(), '789');
    const cola = await pedir(port, '/x', { range: 'bytes=-3' });
    assert.equal(cola.cuerpo.toString(), '789');
  }));

test('un Range fuera del archivo o mal escrito responde 416', () =>
  conArchivo('0123456789', async (port) => {
    for (const range of ['bytes=50-60', 'bytes=5-2', 'palabras=1-2', 'bytes=a-b']) {
      const r = await pedir(port, '/x', { range });
      assert.equal(r.estado, 416, range);
      assert.equal(r.cabeceras['content-range'], 'bytes */10');
    }
  }));

// ---------- router ----------

test('el router manda /conversacion y /medios a sus manejadores y exige el Host permitido', async () => {
  const vistos = [];
  const enrutar = crearRouter({
    webhook: async () => ({ estado: 200, cuerpo: {} }),
    panel: async () => ({ estado: 200, html: 'panel' }),
    conversacion: async (p) => { vistos.push(['conv', p.ruta]); return { estado: 200, html: 'conv' }; },
    medios: async (p) => { vistos.push(['medios', p.ruta]); return { estado: 200, archivo: { ruta: '/x', tipo: 'image/png' } }; },
    dirReportes: '/tmp/x',
    hosts: ['127.0.0.1:3100'],
  });
  const h = { host: '127.0.0.1:3100' };
  assert.equal((await enrutar({ metodo: 'GET', ruta: '/conversacion?chat=a', cabeceras: h })).html, 'conv');
  assert.equal((await enrutar({ metodo: 'GET', ruta: '/medios/ABC', cabeceras: h })).estado, 200);
  assert.deepEqual(vistos, [['conv', '/conversacion?chat=a'], ['medios', '/medios/ABC']]);
  assert.equal((await enrutar({ metodo: 'GET', ruta: '/medios/ABC', cabeceras: { host: 'otro.example' } })).estado, 403);
  assert.equal((await enrutar({ metodo: 'GET', ruta: '/conversacion?chat=a', cabeceras: { host: 'otro.example' } })).estado, 403);
});

// ---------- audio ----------

test('convertirAM4a llama a ffmpeg con argumentos separados (sin shell) y resuelve al terminar bien', async () => {
  const llamadas = [];
  const spawnFalso = (cmd, args, opts) => {
    llamadas.push({ cmd, args, opts });
    const manejadores = {};
    queueMicrotask(() => manejadores.close?.(0));
    return { on: (ev, f) => { manejadores[ev] = f; }, kill: () => {} };
  };
  await convertirAM4a({ origen: '/a/b c.ogg', destino: '/a/conv/b c.m4a', ffmpeg: '/usr/bin/ffmpeg', spawnFn: spawnFalso });
  assert.equal(llamadas[0].cmd, '/usr/bin/ffmpeg');
  assert.ok(llamadas[0].args.includes('/a/b c.ogg') && llamadas[0].args.includes('/a/conv/b c.m4a'));
  assert.ok(!llamadas[0].opts?.shell, 'no usa shell');
  assert.ok(llamadas[0].args.includes('aac'));
});

test('convertirAM4a rechaza si ffmpeg termina con error o no arranca', async () => {
  const falla = () => { const m = {}; queueMicrotask(() => m.close?.(1)); return { on: (e, f) => { m[e] = f; }, kill() {} }; };
  await assert.rejects(convertirAM4a({ origen: 'a', destino: 'b', ffmpeg: 'f', spawnFn: falla }), /ffmpeg/);
  const noArranca = () => { const m = {}; queueMicrotask(() => m.error?.(new Error('ENOENT'))); return { on: (e, f) => { m[e] = f; }, kill() {} }; };
  await assert.rejects(convertirAM4a({ origen: 'a', destino: 'b', ffmpeg: 'f', spawnFn: noArranca }), /ENOENT|ffmpeg/);
});

test('buscarFfmpeg devuelve la primera ruta que exista, respeta FFMPEG_PATH y da null si no hay', () => {
  assert.equal(buscarFfmpeg({ existe: (r) => r === '/opt/homebrew/bin/ffmpeg', env: {} }), '/opt/homebrew/bin/ffmpeg');
  assert.equal(buscarFfmpeg({ existe: (r) => r === '/mi/ffmpeg', env: { FFMPEG_PATH: '/mi/ffmpeg' } }), '/mi/ffmpeg');
  assert.equal(buscarFfmpeg({ existe: () => false, env: {} }), null);
});

// ---------- fechas ----------

test('etiquetaDia escribe el día completo en español y en hora local', () => {
  assert.equal(etiquetaDia(new Date(2026, 10, 9, 19, 56).toISOString()), 'lunes 9 de noviembre de 2026');
  assert.equal(etiquetaDia('no es fecha'), 'no es fecha');
});
