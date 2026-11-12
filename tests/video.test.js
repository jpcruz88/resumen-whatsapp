import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cookieANetscape, urlValida, descargarVideo, resumirVideo } from '../src/video.js';

const COOKIE = 'datr=AAAA; csrftoken=tokenfalso; sessionid=1%3Afalsa%3A1; rur="RMN\\0541\\0541:01ff"';

test('solo se aceptan enlaces https de instagram.com', () => {
  assert.equal(urlValida('https://www.instagram.com/reel/Cxyz123/'), true);
  assert.equal(urlValida('https://instagram.com/p/Cxyz123/'), true);
  for (const mala of ['http://www.instagram.com/reel/x/', 'https://instagram.com.malo.test/reel/x/', 'https://evil.test/?u=instagram.com', 'file:///etc/passwd', 'no es url', '--exec=algo']) {
    assert.equal(urlValida(mala), false, mala);
  }
});

test('la cookie se convierte al formato Netscape que lee yt-dlp', () => {
  const t = cookieANetscape(COOKIE);
  const lineas = t.trim().split('\n');
  assert.equal(lineas[0], '# Netscape HTTP Cookie File');
  assert.ok(lineas.includes('.instagram.com\tTRUE\t/\tTRUE\t2000000000\tsessionid\t1%3Afalsa%3A1'));
  assert.ok(lineas.some((l) => l.endsWith('\trur\t"RMN\\0541\\0541:01ff"')));
  assert.equal(lineas.length, 5);
});

test('descargarVideo pasa la cookie solo en un archivo temporal, que borra al terminar', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vid-'));
  try {
    let args, archivoCookie;
    const ejecutar = async (cmd, a) => {
      args = a; cmd = cmd;
      archivoCookie = a[a.indexOf('--cookies') + 1];
      assert.match(await readFile(archivoCookie, 'utf8'), /sessionid\t1%3Afalsa%3A1/);
      await writeFile(join(dir, 'video.mp4'), 'x');
      return { stdout: '' };
    };
    const ruta = await descargarVideo({ url: 'https://www.instagram.com/reel/Cxyz123/', cookie: COOKIE, dir, ejecutar });
    assert.equal(ruta, join(dir, 'video.mp4'));
    assert.ok(!args.join(' ').includes('falsa'), 'la cookie no va en los argumentos');
    assert.ok(args.includes('--no-playlist') && args.includes('https://www.instagram.com/reel/Cxyz123/'));
    await assert.rejects(access(archivoCookie));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('sin cookie baja el video sin --cookies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vid-'));
  try {
    let args;
    const ejecutar = async (_c, a) => { args = a; await writeFile(join(dir, 'video.mp4'), 'x'); return {}; };
    await descargarVideo({ url: 'https://www.instagram.com/reel/Cxyz123/', dir, ejecutar });
    assert.ok(!args.includes('--cookies'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('descargarVideo rechaza enlaces que no son de Instagram y errores sin filtrar la cookie', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vid-'));
  try {
    await assert.rejects(descargarVideo({ url: 'https://evil.test/x', dir, ejecutar: async () => {} }), /enlace de Instagram/);
    const falla = async () => { const e = new Error(`fallo sessionid=1%3Afalsa%3A1`); e.stderr = 'ERROR: login required'; throw e; };
    const e = await descargarVideo({ url: 'https://www.instagram.com/reel/Cxyz123/', cookie: COOKIE, dir, ejecutar: falla }).catch((x) => x);
    assert.match(e.message, /No se pudo bajar el video/);
    assert.ok(!e.message.includes('falsa'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('resumirVideo manda el video a Gemini y devuelve el texto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vid-'));
  try {
    const ruta = join(dir, 'video.mp4');
    await writeFile(ruta, Buffer.from('bytes-falsos'));
    let pedido;
    const fetchFn = async (url, op) => { pedido = { url, op }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Resumen de prueba.' }] } }] }) }; };
    const t = await resumirVideo({ ruta, apiKey: 'clave-falsa', model: 'modelo-x', fetchFn });
    assert.equal(t, 'Resumen de prueba.');
    assert.match(pedido.url, /models\/modelo-x:generateContent$/);
    assert.equal(pedido.op.headers['x-goog-api-key'], 'clave-falsa');
    assert.ok(!pedido.url.includes('clave-falsa'));
    const cuerpo = JSON.parse(pedido.op.body);
    const partes = cuerpo.contents[0].parts;
    assert.equal(partes[1].inlineData.mimeType, 'video/mp4');
    assert.equal(partes[1].inlineData.data, Buffer.from('bytes-falsos').toString('base64'));
    assert.match(partes[0].text, /resume/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('un video demasiado grande da un error claro y no se envía', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vid-'));
  try {
    const ruta = join(dir, 'video.mp4');
    await writeFile(ruta, Buffer.alloc(1024));
    let llamado = false;
    await assert.rejects(resumirVideo({ ruta, apiKey: 'k', maxBytes: 100, fetchFn: async () => { llamado = true; } }), /demasiado grande/);
    assert.equal(llamado, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('si Gemini falla el error no incluye la clave', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vid-'));
  try {
    const ruta = join(dir, 'video.mp4');
    await writeFile(ruta, 'x');
    const e = await resumirVideo({ ruta, apiKey: 'clave-falsa', fetchFn: async () => ({ ok: false, status: 429 }) }).catch((x) => x);
    assert.match(e.message, /Gemini respondió 429/);
    assert.ok(!e.message.includes('clave-falsa'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
