// Prueba de navegador del panel: datos FICTICIOS + Chrome real por CDP. Sin dependencias.
// Uso: npm run e2e [carpeta-de-capturas] [vacio]
//   Requiere Google Chrome (otra ruta con CHROME_PATH). "vacio" prueba el panel sin ningún mensaje guardado.
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

const argumentos = process.argv.slice(2);
const vacio = argumentos.includes('vacio');
const SALIDA = argumentos.find((a) => a !== 'vacio') ?? join(dirname(fileURLToPath(import.meta.url)), 'capturas');
await mkdir(SALIDA, { recursive: true });

// Datos ficticios: nombres largos, un contacto con ID privado, nombres con símbolos y grupos.
const nombres = ['Ana Beltrán', 'Beto Ríos (Imprenta Beto)', 'Carla Mendoza',
  'Despacho Hernández y Asociados, Contabilidad', 'Eduardo Salas', 'Fernanda Ortiz', 'Gustavo Pérez',
  'Helena Ruiz', 'Iván Castro', 'Julia Navarro', 'Karla Soto', 'Luis Mora', 'María José Fuentes',
  'Nadia Campos', 'Óscar Vidal', 'Paola Reyes', 'Quim Aguirre', 'Rosa Lima', 'Sergio Dávila', 'Tania Cruz'];
const contactos = nombres.map((n, i) => ({ jid: `52155500000${String(i).padStart(2, '0')}@s.whatsapp.net`, nombre: n }));
contactos.push({ jid: '900000000000001@lid', nombre: 'Contacto con ID privado' });
for (let i = 0; i < 40; i++) contactos.push({ jid: `52155511111${String(i).padStart(2, '0')}@s.whatsapp.net`, nombre: `Cliente ${i + 1} Ana` });
contactos.push({ jid: '120363000000000001@g.us', nombre: 'Equipo Ventas', grupo: true },
  { jid: '120363000000000002@g.us', nombre: 'Familia', grupo: true },
  { jid: '120363000000000003@g.us', nombre: 'Proveedores y entregas del mes de noviembre', grupo: true });

// Cada contacto con mensajes guardados; el primero tuvo mensajes hoy y el resto, días atrás.
const ahora = Date.now();
const chats = contactos.map((c, i) => ({
  chat: c.jid, esGrupo: !!c.grupo, total: 5 + ((i * 37) % 900),
  primero: new Date(ahora - (200 + i) * 86400000).toISOString(),
  ultimo: new Date(ahora - (i === 0 ? 3600000 : (i + 1) * 3 * 3600000 * 4)).toISOString(),
}));
const almacen = { resumenChats: async () => (vacio ? [] : chats), formas: async (c) => [c] };

const panel = crearPanel({
  almacen,
  evolution: { listarChats: async () => contactos },
  generar: async () => { await new Promise((r) => setTimeout(r, 1800)); return { id: 'demo', url: '/reportes/demo' }; },
});
const srv = createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const u = new URL(req.url, 'http://x');
  const r = await panel({ metodo: req.method, ruta: u.pathname, consulta: u.search.slice(1), cuerpo: b ? JSON.parse(b) : undefined });
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
async function ir(ruta, { ancho, alto, oscuro, movil }) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: movil });
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: oscuro ? 'dark' : 'light' }] });
  await cmd('Page.navigate', { url: base + ruta });
  await dormir(900);
}
async function foto(nombre) {
  const r = await cmd('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(SALIDA, nombre + '.png'), Buffer.from(r.result.data, 'base64'));
}
const cel = { ancho: 390, alto: 844, movil: true };
const mac = { ancho: 1280, alto: 800, movil: false };
const sinDesborde = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';
const visibles = "document.querySelectorAll('#lista li:not([hidden])').length";
const informe = {};
const chatPersona = 'chat?chat=' + encodeURIComponent(contactos[1].jid);
const chatReciente = 'chat?chat=' + encodeURIComponent(contactos[0].jid);

await ir('', { ...cel, oscuro: false });
await foto('01-movil-lista-claro');
informe.sinDesbordeHorizontal390 = await js(sinDesborde);

if (vacio) {
  informe.explicaVacio = await js("document.body.textContent.includes('Todavía no hay mensajes guardados')");
  informe.sinLista = await js("!document.querySelector('#lista')");
  await ir('', { ...mac, oscuro: false });
  await foto('08-escritorio-vacio');
} else {
  informe.visiblesSinEscribir = await js(visibles);
  await js("document.querySelector('#f-grupos').click()"); await dormir(250);
  await foto('02-movil-solo-grupos');
  informe.visiblesGrupos = await js(visibles);
  informe.soloGrupos = await js("[...document.querySelectorAll('#lista li:not([hidden])')].every((l) => l.dataset.tipo === 'grupo')");
  await js("document.querySelector('#f-todos').click()"); await dormir(250);
  await js("document.querySelector('#mas').click()"); await dormir(250);
  informe.visiblesTrasMostrarMas = await js(visibles);
  await js("const i=document.querySelector('#buscar');i.value='ana';i.dispatchEvent(new Event('input'))"); await dormir(250);
  await foto('03-movil-busqueda');
  informe.coincidenciasAna = await js(visibles);
  informe.todosLosEnlacesVanAUnChat = await js("[...document.querySelectorAll('#lista a')].every((a) => a.getAttribute('href').startsWith('/chat?chat='))");

  await ir('', { ...cel, oscuro: true });
  await foto('04-movil-lista-oscuro');
  await ir(chatPersona, { ...cel, oscuro: false });
  await foto('05-movil-chat');
  informe.sugiereUltimoDia = await js("!!document.querySelector('[data-dia]')");
  await js("document.querySelector('[data-dia]').click()"); await dormir(200);
  informe.rangoTrasSugerencia = await js("!document.querySelector('#rango').hidden && document.querySelector('#desde').value === document.querySelector('[data-dia]').dataset.dia");
  await foto('06-movil-chat-rango');
  informe.fechasDentroDeLaFicha = await js("[...document.querySelectorAll('#rango input')].every((i) => i.getBoundingClientRect().right <= document.querySelector('#form-resumen').getBoundingClientRect().right)");
  await js("document.querySelector('#generar').click()"); await dormir(350);
  informe.botonDuranteCarga = await js("document.querySelector('#generar').disabled");
  await dormir(2200);
  await foto('07-movil-resultado');
  informe.enlaceReporte = await js("document.querySelector('#estado a')?.getAttribute('href')");
  await ir(chatReciente, { ...cel, oscuro: false });
  informe.sinSugerenciaSiHayHoy = await js("!document.querySelector('[data-dia]')");
  await ir(chatPersona, { ...cel, oscuro: true });
  await foto('09-movil-chat-oscuro');
  await ir('', { ...mac, oscuro: false });
  await foto('08-escritorio-lista-claro');
  await ir(chatPersona, { ...mac, oscuro: true });
  await foto('10-escritorio-chat-oscuro');
  // Escritorio: lista a la izquierda y detalle a la derecha, a la vez.
  informe.dosPanelesEnEscritorio = await js("(() => { const l = document.querySelector('.lateral').getBoundingClientRect(); const d = document.querySelector('.detalle').getBoundingClientRect(); return l.width > 280 && d.left >= l.right - 1 && d.width > 500; })()");
  informe.chatActivoMarcado = await js("document.querySelectorAll('.fila[aria-current=\"page\"]').length === 1");
  informe.sinScrollDePaginaEnEscritorio = await js("document.documentElement.scrollHeight <= document.documentElement.clientHeight");
  await js("document.querySelector('#generar').click()"); await dormir(2600);
  informe.resumenSeAbreALaDerecha = await js("document.querySelector('#vista') && !document.querySelector('#vista').hidden && document.querySelector('#marco').getAttribute('src') === '/reportes/demo'");
  informe.listaSigueVisible = await js("document.querySelector('.lateral').getBoundingClientRect().width > 280");
  await foto('11-escritorio-resumen-derecha');
  await ir('', { ...cel, oscuro: false, ancho: 320, alto: 640 });
  informe.sinDesbordeHorizontal320 = await js(sinDesborde);
  await ir(chatPersona, { ...cel, oscuro: false, ancho: 320, alto: 640 });
  informe.chatSinDesborde320 = await js(sinDesborde);
}

chrome.kill(); srv.close();
const esperado = vacio
  ? { sinDesbordeHorizontal390: true, explicaVacio: true, sinLista: true }
  : { sinDesbordeHorizontal390: true, sinDesbordeHorizontal320: true, chatSinDesborde320: true, visiblesSinEscribir: 40,
      visiblesGrupos: 3, soloGrupos: true, visiblesTrasMostrarMas: 64, coincidenciasAna: 40, todosLosEnlacesVanAUnChat: true,
      sugiereUltimoDia: true, fechasDentroDeLaFicha: true, rangoTrasSugerencia: true, botonDuranteCarga: true, enlaceReporte: '/reportes/demo',
      sinSugerenciaSiHayHoy: true, dosPanelesEnEscritorio: true, chatActivoMarcado: true,
      sinScrollDePaginaEnEscritorio: true, resumenSeAbreALaDerecha: true, listaSigueVisible: true };
const fallos = Object.entries(esperado).filter(([k, v]) => informe[k] !== v);
console.log(JSON.stringify(informe, null, 1));
if (fallos.length) {
  console.error('FALLÓ: ' + fallos.map(([k, v]) => `${k} esperado ${JSON.stringify(v)}, obtuvo ${JSON.stringify(informe[k])}`).join('; '));
  process.exit(1);
}
console.log(`OK: ${Object.keys(esperado).length} comprobaciones. Capturas en ${SALIDA}`);
process.exit(0);
