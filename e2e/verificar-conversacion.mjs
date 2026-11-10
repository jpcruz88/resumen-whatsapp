// Prueba de navegador de la conversación: servidor real, datos FICTICIOS, una imagen PNG y un audio reales.
// Uso: npm run e2e:conversacion [carpeta-de-capturas]   (requiere Google Chrome; ffmpeg es opcional).
// Falla con código 1 si algo no se cumple. Capturas en e2e/capturas (ignorada por git).
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SRC = new URL('../src/', import.meta.url).href;
const { Almacen } = await import(SRC + 'almacen.js');
const { Vigilados } = await import(SRC + 'vigilados.js');
const { crearConversacion } = await import(SRC + 'conversacion.js');
const { crearMedios } = await import(SRC + 'medios-http.js');
const { crearRouter, crearServidorHttp } = await import(SRC + 'servidor.js');
const { buscarFfmpeg, convertirAM4a } = await import(SRC + 'audio.js');

const SALIDA = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'capturas');
await mkdir(SALIDA, { recursive: true });
const CHAT = '120363000000000001@g.us';
const loc = (a, m, d, h, min) => new Date(a, m, d, h, min, 0, 0).toISOString();

// PNG de verdad (degradado) sin dependencias.
function png(ancho, alto) {
  const tabla = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tabla[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => {
    const t = Buffer.concat([Buffer.from(tipo), datos]);
    const l = Buffer.alloc(4); l.writeUInt32BE(datos.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([l, t, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3);
    for (let x = 0; x < ancho; x++) { fila[1 + x * 3] = 40 + (x * 150) / ancho; fila[2 + x * 3] = 120 + (y * 100) / alto; fila[3 + x * 3] = 170; }
    filas.push(fila);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}

const dir = await mkdtemp(join(tmpdir(), 'conv-e2e-'));
const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
await vigilados.activar(CHAT);
const almacen = new Almacen({ dir, vigilados });
const ffmpeg = buscarFfmpeg();

const base = { chat: CHAT, esGrupo: true, propio: false };
await almacen.guardarLote([
  { ...base, id: 'a1', fecha: loc(2026, 10, 8, 18, 40), tipo: 'texto', nombre: 'Ana Beltrán', autor: 'x1', texto: 'Buenas tardes, ¿alguien tiene la lista de precios? https://ejemplo.com/precios' },
  { ...base, id: 'a2', fecha: loc(2026, 10, 8, 18, 42), tipo: 'texto', nombre: 'Beto Ríos', autor: 'x2', texto: 'Sí, ahorita la mando.\nSon tres hojas.' },
  { ...base, id: 'a3', fecha: loc(2026, 10, 8, 18, 43), tipo: 'audio', nombre: 'Beto Ríos', autor: 'x2', texto: null, mediaId: 'AUDIOHIST', mimetype: 'audio/ogg', sinMedio: true },
  { ...base, id: 'b1', fecha: loc(2026, 10, 9, 9, 5), tipo: 'imagen', nombre: 'Ana Beltrán', autor: 'x1', texto: 'la factura de la imprenta', mediaId: 'IMG001', mimetype: 'image/png' },
  { ...base, id: 'b2', fecha: loc(2026, 10, 9, 9, 6), tipo: 'audio', nombre: 'Carla Mendoza', autor: 'x3', texto: null, mediaId: 'AUD001', mimetype: 'audio/ogg' },
  { ...base, id: 'b3', fecha: loc(2026, 10, 9, 9, 8), tipo: 'texto', nombre: 'Yo', propio: true, texto: 'Perfecto, gracias. Les confirmo hoy mismo.' },
  { ...base, id: 'b4', fecha: loc(2026, 10, 9, 9, 9), tipo: 'imagen', nombre: 'Carla Mendoza', autor: 'x3', texto: null, mediaId: 'IMGFALTA', mimetype: 'image/png' },
]);
await almacen.guardarMedio({ chat: CHAT, mediaId: 'IMG001', mimetype: 'image/png', buffer: png(480, 320) });
let hayAudioReal = false;
if (ffmpeg) {
  const ruta = almacen.rutaMedio({ mediaId: 'AUD001', mimetype: 'audio/ogg' });
  await mkdir(join(dir, 'media'), { recursive: true });
  hayAudioReal = spawnSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libopus', ruta]).status === 0;
}
if (!hayAudioReal) await almacen.guardarMedio({ chat: CHAT, mediaId: 'AUD001', mimetype: 'audio/ogg', buffer: Buffer.from('no-es-un-ogg-real') });
await writeFile(almacen.rutaMedio({ mediaId: 'AUD001', mimetype: 'audio/ogg' }) + '.txt', 'Necesito que me mandes la cotización de las cincuenta copias antes del lunes.');

const PUERTO = 3121;
const manejar = crearRouter({
  webhook: async () => ({ estado: 404, cuerpo: {} }),
  panel: async () => ({ estado: 404, cuerpo: {} }),
  conversacion: crearConversacion({ almacen, vigilados, nombrePara: async () => 'Bodega Norte', version: '0.6.0' }),
  medios: crearMedios({ almacen, convertir: ffmpeg ? (origen, destino) => convertirAM4a({ origen, destino, ffmpeg }) : null }),
  dirReportes: join(dir, 'reportes'),
  hosts: [`127.0.0.1:${PUERTO}`],
});
const servidor = crearServidorHttp({ manejar }).listen(PUERTO, '127.0.0.1');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const perfil = await mkdtemp(join(tmpdir(), 'conv-e2e-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9336', `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const lista = await (await fetch('http://127.0.0.1:9336/json/list')).json();
const ws = new WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const espera = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && espera.has(d.id)) { espera.get(d.id)(d); espera.delete(d.id); } });
const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; espera.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
async function ir(url, { ancho, alto, oscuro, movil }) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: movil });
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: oscuro ? 'dark' : 'light' }] });
  await cmd('Page.navigate', { url });
  await dormir(1200);
}
async function foto(nombre) {
  const r = await cmd('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(SALIDA, `conv-${nombre}.png`), Buffer.from(r.result.data, 'base64'));
}
const url = `http://127.0.0.1:${PUERTO}/conversacion?chat=${encodeURIComponent(CHAT)}&desde=2026-11-08&hasta=2026-11-09`;
const sinDesborde = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';
const visibles = "[...document.querySelectorAll('#lista > li.msg')].filter((l) => !l.hidden)";
const informe = {};

await ir(url, { ancho: 390, alto: 1700, movil: true, oscuro: false });
await foto('movil-claro');
informe.sinDesborde390 = await js(sinDesborde);
informe.mensajes = await js('document.querySelectorAll("#lista > li.msg").length');
informe.separadoresDeDia = await js('document.querySelectorAll("#lista > li.dia").length');
informe.imagenCargada = await js('(() => { const i = document.querySelector(".foto img"); return !!i && i.complete && i.naturalWidth === 480; })()');
informe.reproductores = await js('document.querySelectorAll("audio").length');
informe.fuentesDeAudio = await js('[...document.querySelectorAll("audio source")].map((s) => s.type).join(",")');
informe.rangoDelAudio = await js(`fetch('/medios/AUD001', { headers: { range: 'bytes=0-9' } }).then((r) => r.status + ' ' + r.headers.get('content-range'))`);
informe.m4a = await js(`fetch('/medios/AUD001.m4a').then((r) => r.status)`);
informe.transcripcionVisible = await js('document.body.textContent.includes("cotización de las cincuenta copias")');
informe.enlaceClicable = await js('!!document.querySelector(".texto a[href=\\"https://ejemplo.com/precios\\"]")');
informe.marcadoresSinArchivo = await js('document.querySelectorAll(".sin-medio").length');

// Filtros: por tipo y por texto, y que los separadores de día sigan a sus mensajes.
await js("document.querySelector('#t-imagen').click()"); await dormir(250);
await foto('movil-solo-imagenes');
informe.filtroImagenes = await js(`${visibles}.length + ':' + ${visibles}.every((l) => l.dataset.tipo === 'imagen')`);
await js("document.querySelector('#t-audio').click()"); await dormir(150);
informe.diasVisiblesConAudios = await js('[...document.querySelectorAll("#lista > li.dia")].filter((l) => !l.hidden).length');
await js("document.querySelector('#t-todo').click()"); await dormir(150);
const escribirEnBuscador = (texto) => js(`(() => { const i = document.querySelector('#buscar'); i.value = ${JSON.stringify(texto)}; i.dispatchEvent(new Event('input')); })()`);
await escribirEnBuscador('COTIZACION'); await dormir(250);
informe.buscaEnTranscripciones = await js(`${visibles}.length`);
await escribirEnBuscador(''); await dormir(150);
informe.sinFiltroVuelveTodo = await js(`${visibles}.length`);

await ir(url, { ancho: 390, alto: 844, movil: true, oscuro: true });
await foto('movil-oscuro');
await ir(url, { ancho: 320, alto: 640, movil: true, oscuro: false });
informe.sinDesborde320 = await js(sinDesborde);
await ir(url, { ancho: 1100, alto: 800, movil: false, oscuro: false });
await foto('escritorio-claro');
informe.sinDesborde1100 = await js(sinDesborde);
await ir(url, { ancho: 1100, alto: 800, movil: false, oscuro: true });
await foto('escritorio-oscuro');

// Seguridad vista desde el navegador: un host ajeno y un id con ruta no sirven nada.
informe.hostAjeno = await new Promise((resolve, reject) => {
  request({ host: '127.0.0.1', port: PUERTO, path: '/medios/IMG001', headers: { host: 'otro.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject).end();
});
informe.idConRuta = await js(`fetch('/medios/..%2F..%2Fvigilados').then((r) => r.status)`);

chrome.kill(); servidor.close(); servidor.closeAllConnections?.();
const esperado = {
  sinDesborde390: true, sinDesborde320: true, sinDesborde1100: true, mensajes: 7, separadoresDeDia: 2,
  imagenCargada: true, reproductores: 1, fuentesDeAudio: 'audio/ogg,audio/mp4', transcripcionVisible: true, enlaceClicable: true,
  marcadoresSinArchivo: 2, filtroImagenes: '2:true', diasVisiblesConAudios: 2, buscaEnTranscripciones: 1, sinFiltroVuelveTodo: 7,
  idConRuta: 404, hostAjeno: 403,
  ...(hayAudioReal ? { rangoDelAudio: (informe.rangoDelAudio ?? '').startsWith('206 bytes 0-9/') ? informe.rangoDelAudio : '206 bytes 0-9/…', m4a: 200 } : {}),
};
const fallos = Object.entries(esperado).filter(([k, v]) => informe[k] !== v);
console.log(JSON.stringify({ ...informe, audioRealConFfmpeg: hayAudioReal }, null, 1));
if (fallos.length) {
  console.error('FALLÓ: ' + fallos.map(([k, v]) => `${k} esperado ${JSON.stringify(v)}, obtuvo ${JSON.stringify(informe[k])}`).join('; '));
  process.exit(1);
}
console.log(`OK: ${Object.keys(esperado).length} comprobaciones. Capturas en ${SALIDA}`);
process.exit(0);
