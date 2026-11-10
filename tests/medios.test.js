import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { procesarMedio } from '../src/medios.js';

async function conArchivo(fn, nombre = 'm1.ogg', bytes = Buffer.from('datos-de-audio')) {
  const dir = await mkdtemp(join(tmpdir(), 'medios-'));
  try {
    const ruta = join(dir, nombre);
    await writeFile(ruta, bytes);
    await fn(ruta, bytes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeFetch(texto, { status = 200 } = {}) {
  const llamadas = [];
  const fn = async (url, opts) => {
    llamadas.push({ url, opts, body: JSON.parse(opts.body) });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
      text: async () => 'error',
    };
  };
  fn.llamadas = llamadas;
  return fn;
}

test('audio: envía inlineData base64 con el mimetype y devuelve la transcripción', async () => {
  await conArchivo(async (ruta, bytes) => {
    const f = fakeFetch('hola, mañana te mando el reporte');
    const r = await procesarMedio({
      tipo: 'audio', ruta, mimetype: 'audio/ogg', apiKey: 'K', model: 'm', fetchFn: f,
    });
    assert.equal(r, 'hola, mañana te mando el reporte');
    const parts = f.llamadas[0].body.contents[0].parts;
    const inline = parts.find((p) => p.inlineData).inlineData;
    assert.equal(inline.mimeType, 'audio/ogg');
    assert.equal(inline.data, bytes.toString('base64'));
    const prompt = parts.find((p) => p.text).text;
    assert.match(prompt, /Transcribe este audio en el idioma en que se habla, sin traducir/);
    assert.doesNotMatch(prompt, /en español/);
  });
});

test('imagen: usa el prompt de descripción en una línea', async () => {
  await conArchivo(async (ruta) => {
    const f = fakeFetch('Captura de una factura');
    const r = await procesarMedio({
      tipo: 'imagen', ruta, mimetype: 'image/jpeg', apiKey: 'K', model: 'm', fetchFn: f,
    });
    assert.equal(r, 'Captura de una factura');
    const parts = f.llamadas[0].body.contents[0].parts;
    assert.match(parts.find((p) => p.text).text, /Describe esta imagen en una línea/);
  }, 'm2.jpg');
});

test('caché: escribe <ruta>.txt y la segunda llamada no usa fetch', async () => {
  await conArchivo(async (ruta) => {
    const f = fakeFetch('texto uno');
    await procesarMedio({ tipo: 'audio', ruta, mimetype: 'audio/ogg', apiKey: 'K', model: 'm', fetchFn: f });
    assert.equal(await readFile(`${ruta}.txt`, 'utf8'), 'texto uno');
    const f2 = fakeFetch('otro');
    const r = await procesarMedio({ tipo: 'audio', ruta, mimetype: 'audio/ogg', apiKey: 'K', model: 'm', fetchFn: f2 });
    assert.equal(r, 'texto uno');
    assert.equal(f2.llamadas.length, 0);
  });
});

test('respuesta 400: lanza error en español con cause y sin filtrar la clave', async () => {
  await conArchivo(async (ruta) => {
    const f = fakeFetch('', { status: 400 });
    await assert.rejects(
      procesarMedio({ tipo: 'audio', ruta, mimetype: 'audio/ogg', apiKey: 'CLAVE-SECRETA', model: 'm', fetchFn: f }),
      (e) => {
        assert.equal(e.message, 'no se pudo procesar el medio');
        assert.ok(e.cause);
        assert.ok(!String(e.cause.message).includes('CLAVE-SECRETA'));
        return true;
      },
    );
  });
});

test('fallo de red: también lanza el error en español con cause', async () => {
  await conArchivo(async (ruta) => {
    const f = async () => { throw new Error('ECONNRESET'); };
    await assert.rejects(
      procesarMedio({ tipo: 'imagen', ruta, mimetype: 'image/png', apiKey: 'K', model: 'm', fetchFn: f }),
      (e) => e.message === 'no se pudo procesar el medio' && e.cause.message === 'ECONNRESET',
    );
  });
});
