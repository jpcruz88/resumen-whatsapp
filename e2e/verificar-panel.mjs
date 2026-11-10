// Prueba de navegador del panel: datos FICTICIOS + Chrome real por CDP. Sin dependencias.
// Uso: npm run e2e [carpeta-de-capturas] [vacio]
//   Requiere Google Chrome (otra ruta con CHROME_PATH). "vacio" prueba el panel sin chats vigilados.
// Falla con código 1 si alguna comprobación no se cumple. Guarda capturas en claro y oscuro,
// móvil y escritorio, en e2e/capturas (ignorada por git).
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url).href;
const { crearPanel } = await import(SRC + 'panel.js');
const { Vigilados } = await import(SRC + 'vigilados.js');

const argumentos = process.argv.slice(2);
const vacio = argumentos.includes('vacio');
const SALIDA = argumentos.find((a) => a !== 'vacio') ?? join(dirname(fileURLToPath(import.meta.url)), 'capturas');
await mkdir(SALIDA, { recursive: true });

// Datos ficticios: nombres largos, un contacto con ID privado y nombres que empiezan con símbolos.
const nombres = ['Ana Beltrán', 'Beto Ríos (Imprenta Beto)', 'Carla Mendoza',
  'Despacho Hernández y Asociados, Contabilidad', 'Eduardo Salas', 'Fernanda Ortiz', 'Gustavo Pérez',
  'Helena Ruiz', 'Iván Castro', 'Julia Navarro', 'Karla Soto', 'Luis Mora', 'María José Fuentes',
  'Nadia Campos', 'Óscar Vidal', 'Paola Reyes', 'Quim Aguirre', 'Rosa Lima', 'Sergio Dávila', 'Tania Cruz'];
const chats = nombres.map((n, i) => ({ jid: `52155500000${String(i).padStart(2, '0')}@s.whatsapp.net`, nombre: n }));
chats.push({ jid: '900000000000001@lid', nombre: 'Contacto con ID privado' });
for (let i = 0; i < 40; i++) chats.push({ jid: `52155511111${String(i).padStart(2, '0')}@s.whatsapp.net`, nombre: `Cliente ${i + 1} Ana` });
chats.push({ jid: '5215522222222@s.whatsapp.net', nombre: '.' }, { jid: '5215533333333@s.whatsapp.net', nombre: '👌' });

const dir = await mkdtemp(join(tmpdir(), 'panel-e2e-'));
const vigilados = new Vigilados({ archivo: join(dir, 'v.json') });
if (!vacio) for (const c of [chats[0], chats[3], chats[7]]) await vigilados.activar(c.jid);
const panel = crearPanel({
  vigilados,
  evolution: { listarChats: async () => chats },
  generar: async () => { await new Promise((r) => setTimeout(r, 1800)); return { id: 'demo', url: '/reportes/demo' }; },
});
const srv = createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const r = await panel({ metodo: req.method, ruta: new URL(req.url, 'http://x').pathname, cuerpo: b ? JSON.parse(b) : undefined });
  if (r.html) { res.writeHead(r.estado, { 'content-type': 'text/html; charset=utf-8' }); res.end(r.html); return; }
  res.writeHead(r.estado, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.cuerpo));
}).listen(3120, '127.0.0.1');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const perfil = await mkdtemp(join(tmpdir(), 'panel-e2e-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${perfil}`,
  '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const lista = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const esperando = new Map();
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && esperando.has(d.id)) { esperando.get(d.id)(d); esperando.delete(d.id); }
});
const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; esperando.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expression) => (await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

const base = 'http://127.0.0.1:3120/';
const nueva = () => base + '?r=' + Date.now(); // fuerza una carga completa (un cambio de #hash no recarga)
async function ir(url, { ancho, alto, oscuro, movil }) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: movil });
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: oscuro ? 'dark' : 'light' }] });
  await cmd('Page.navigate', { url });
  await dormir(900);
}
async function foto(nombre) {
  const r = await cmd('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(SALIDA, nombre + '.png'), Buffer.from(r.result.data, 'base64'));
}
const cel = { ancho: 390, alto: 844, movil: true };
const mac = { ancho: 1280, alto: 800, movil: false };
const sinDesborde = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';
const informe = {};

await ir(nueva(), { ...cel, oscuro: false });
await foto('01-movil-resumen-claro');
informe.sinDesbordeHorizontal390 = await js(sinDesborde);

if (!vacio) {
  await js("document.querySelector('#t-chats').click()"); await dormir(200);
  await foto('02-movil-chats-claro');
  await js("const i=document.querySelector('#buscar');i.value='ana';i.dispatchEvent(new Event('input'))"); await dormir(250);
  await foto('03-movil-busqueda');
  informe.coincidenciasVisibles = await js("document.querySelectorAll('#lista-resultados li:not([hidden])').length");
  const antes = await js("document.querySelectorAll('#lista-vigilados li').length");
  await js("document.querySelector('#lista-resultados li:not([hidden]) button').click()"); await dormir(500);
  informe.vigiladosAntes = antes;
  informe.vigiladosDespues = await js("document.querySelectorAll('#lista-vigilados li').length");
  informe.cuentaTexto = await js("document.querySelector('#cuenta-vigilados').textContent");
  informe.opcionesSelector = await js("document.querySelectorAll('#chat option').length");

  await ir(nueva(), { ...cel, oscuro: true });
  await foto('04-movil-resumen-oscuro');
  await js("document.querySelector('#generar').click()"); await dormir(350);
  await foto('05-movil-generando');
  informe.botonDuranteCarga = await js("document.querySelector('#generar').disabled");
  await dormir(2200);
  await foto('06-movil-resultado');
  informe.enlaceReporte = await js("document.querySelector('#estado a')?.getAttribute('href')");
  await js("document.querySelector('#p-rango').click()"); await dormir(200);
  await foto('07-movil-otro-rango');
  informe.rangoVisible = await js("!document.querySelector('#rango').hidden");
}

await ir(nueva(), { ...cel, oscuro: false, ancho: 320, alto: 640 });
await foto('10-movil-320');
informe.sinDesbordeHorizontal320 = await js(sinDesborde);
informe.pestanaInicial = await js("document.querySelector('[role=tab][aria-selected=true]').textContent");
await ir(nueva(), { ...mac, oscuro: false });
await foto('08-escritorio-claro');
await ir(nueva(), { ...mac, oscuro: true });
await foto('09-escritorio-oscuro');
informe.pestanasVisiblesEnEscritorio = await js("getComputedStyle(document.querySelector('.pestanas')).display");
informe.panelesVisiblesEnEscritorio = await js("[...document.querySelectorAll('.panel')].map(p=>getComputedStyle(p).display).join(',')");

chrome.kill(); srv.close();
const esperado = vacio
  ? { sinDesbordeHorizontal390: true, sinDesbordeHorizontal320: true, pestanaInicial: 'Chats',
      pestanasVisiblesEnEscritorio: 'none', panelesVisiblesEnEscritorio: 'block,block' }
  : { sinDesbordeHorizontal390: true, sinDesbordeHorizontal320: true, coincidenciasVisibles: 30,
      vigiladosAntes: 3, vigiladosDespues: 4, cuentaTexto: '4', opcionesSelector: 4, botonDuranteCarga: true,
      enlaceReporte: '/reportes/demo', rangoVisible: true, pestanaInicial: 'Resumen',
      pestanasVisiblesEnEscritorio: 'none', panelesVisiblesEnEscritorio: 'block,block' };
const fallos = Object.entries(esperado).filter(([k, v]) => informe[k] !== v);
console.log(JSON.stringify(informe, null, 1));
if (fallos.length) {
  console.error('FALLÓ: ' + fallos.map(([k, v]) => `${k} esperado ${JSON.stringify(v)}, obtuvo ${JSON.stringify(informe[k])}`).join('; '));
  process.exit(1);
}
console.log(`OK: ${Object.keys(esperado).length} comprobaciones. Capturas en ${SALIDA}`);
process.exit(0);
