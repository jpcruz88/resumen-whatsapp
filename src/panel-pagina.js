// Páginas del panel. Modo "operar": entras, eliges un chat y pides su resumen o abres su conversación.
//   pagina()      la lista de todos los chats guardados, con buscador.
//   paginaChat()  un chat: periodo, "Generar resumen" y "Ver conversación".
// Sin dependencias: HTML + CSS + JS en línea. Los datos del servidor llegan solo por atributos ya
// escapados; el JS no inyecta HTML con datos ajenos.
import { escaparHtml } from './reporte.js';
import { etiquetaRango, etiquetaReciente, diaLocal } from './fechas.js';

const CSS = String.raw`
:root {
  color-scheme: light dark;
  --bg: #ffffff; --lateral: #f7f7f8; --superficie: #ffffff; --superficie-2: #f1f1f3;
  --texto: #18181b; --suave: #6b6b75; --borde: #e4e4e7;
  --acento: #18181b; --acento-hover: #3f3f46; --sobre-acento: #ffffff; --acento-suave: #ececef;
  --aviso: #fff3cd; --sobre-aviso: #7a5b00;
  --error: #a8261e; --error-suave: #fbe9e7;
  --radio: 12px; --radio-s: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #131315; --lateral: #19191c; --superficie: #1b1b1e; --superficie-2: #232327;
    --texto: #ededf0; --suave: #9a9aa5; --borde: #2c2c31;
    --acento: #f4f4f5; --acento-hover: #d4d4d8; --sobre-acento: #131315; --acento-suave: #2a2a2f;
    --aviso: #3b3210; --sobre-aviso: #f5d77a;
    --error: #ff9a90; --error-suave: #3a1c19;
  }
}
* { box-sizing: border-box; }
html { scrollbar-color: var(--borde) transparent; -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--texto);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  accent-color: var(--acento);
}
::selection { background: var(--acento-suave); color: var(--texto); }
input, select, button { font: inherit; color: inherit; caret-color: var(--acento); }
:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
[hidden] { display: none !important; }
.solo-lectores { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* Aplicación: lista de chats a la izquierda, detalle a la derecha (en móvil, una pantalla a la vez). */
.app { min-height: 100dvh; }
.lateral { background: var(--lateral); padding: 0 0 24px; }
.lat-cab { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; }
.logo { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: var(--acento); color: var(--sobre-acento); }
.logo svg { width: 18px; height: 18px; }
.marca { margin: 0; font-size: 1rem; font-weight: 650; letter-spacing: -0.01em; }
.marca a { color: inherit; text-decoration: none; }
.lat-cuerpo { padding: 0 12px; }
.aviso-global { padding: 0 12px 8px; }
.aviso-global .msg { margin: 0; }
.detalle { padding: 16px; }
.detalle-vacio { display: none; }

h1 { margin: 0; font-size: 1.35rem; line-height: 1.25; font-weight: 700; letter-spacing: -0.015em; overflow-wrap: anywhere; text-wrap: balance; }
.suave { color: var(--suave); font-size: .875rem; margin: 2px 0 0; }
.volver { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; margin: 0 0 4px -4px; padding: 0 4px; color: var(--suave); font-weight: 600; text-decoration: none; }
.volver:hover { color: var(--texto); }
.volver svg { width: 18px; height: 18px; }

.msg { padding: 12px 14px; border-radius: var(--radio-s); background: var(--superficie-2); font-size: .95rem; }
.msg.error { background: var(--error-suave); color: var(--error); }
.msg.ok { background: var(--acento-suave); }
.msg p { margin: 0 0 10px; }
.msg p:last-child { margin: 0; }
.msg .boton { width: 100%; }

.campo { display: grid; gap: 6px; margin-bottom: 12px; }
label, legend { font-weight: 600; font-size: .85rem; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
input[type="date"], input[type="search"] {
  width: 100%; min-width: 0; min-height: 44px; padding: 8px 12px; background: var(--superficie);
  border: 1px solid var(--borde); border-radius: var(--radio-s);
}
input:hover { border-color: var(--suave); }
.busca { position: relative; }
.busca svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--suave); pointer-events: none; }
.busca input { padding-left: 38px; }
#ayuda-busqueda { margin: 8px 4px 6px; }

.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips input { position: absolute; opacity: 0; pointer-events: none; }
.chip {
  display: inline-grid; place-items: center; min-height: 44px; padding: 0 14px; text-align: center;
  border: 1px solid var(--borde); border-radius: 999px; background: var(--superficie); font-size: .875rem; font-weight: 600; cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.chip:hover { border-color: var(--suave); }
.chips input:checked + .chip { background: var(--acento); border-color: var(--acento); color: var(--sobre-acento); }
.chips input:focus-visible + .chip { outline: 2px solid var(--acento); outline-offset: 2px; }
.filtros { margin: 10px 0 0; }
#rango { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-top: 12px; }
#rango .campo { margin: 0; }

.boton {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px;
  border-radius: var(--radio-s); border: 1px solid transparent; font-weight: 650; cursor: pointer; text-decoration: none;
  transition: background .15s, border-color .15s, opacity .15s;
}
.primario { background: var(--acento); color: var(--sobre-acento); }
.primario:hover:not(:disabled) { background: var(--acento-hover); }
.secundario { background: transparent; border-color: var(--borde); color: var(--texto); }
.secundario:hover:not(:disabled) { border-color: var(--suave); background: var(--superficie-2); }
.enlace { min-height: 44px; padding: 0; background: none; border: 0; color: var(--texto); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.boton:disabled { opacity: .55; cursor: not-allowed; }
.boton[data-cargando="true"]::before {
  content: ""; width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid currentColor; border-right-color: transparent; animation: gira .8s linear infinite;
}
@keyframes gira { to { transform: rotate(360deg); } }
#estado { margin-top: 12px; }
#estado:empty { display: none; }
#mas { width: 100%; margin-top: 8px; }

.filas { list-style: none; margin: 0; padding: 0; }
.fila { position: relative; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px; border-radius: var(--radio-s); color: inherit; text-decoration: none; }
.fila:hover { background: var(--superficie-2); }
.fila[aria-current="page"] { background: var(--superficie); box-shadow: 0 0 0 1px var(--borde); }
.fila[aria-current="page"]::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 3px; background: var(--acento); }
.avatar {
  flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%;
  background: var(--acento-suave); color: var(--texto); font-weight: 650; font-size: .85rem;
}
.avatar svg { width: 18px; height: 18px; }
.datos { flex: 1; min-width: 0; display: grid; }
.nombre { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font-weight: 600; font-size: .9rem; line-height: 1.3; }
.detalle-fila { color: var(--suave); font-size: .78rem; font-variant-numeric: tabular-nums; }
.flecha { flex: none; width: 18px; height: 18px; color: var(--suave); }
.vacio { padding: 18px 16px; background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); }
.vacio p { margin: 0 0 6px; }

.det-cab { margin-bottom: 12px; }
.barra-form { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.acciones-form { display: flex; flex-wrap: wrap; gap: 8px; }
.ultimo { margin: 10px 0 0; font-size: .875rem; color: var(--suave); }
.ultimo .enlace { min-height: 0; }
#vista { display: none; }
.pie { padding: 16px 16px 0; color: var(--suave); font-size: .78rem; }

@media (max-width: 899px) {
  .app.con-chat .lateral { display: none; }
  .app:not(.con-chat) .detalle { display: none; }
  .acciones-form { display: grid; grid-template-columns: 1fr; width: 100%; }
  .acciones-form .boton { width: 100%; }
  .solo-escritorio { display: none; }
}
@media (min-width: 900px) {
  html, body { height: 100%; overflow: hidden; }
  .app { display: grid; grid-template-columns: 320px minmax(0, 1fr); height: 100dvh; min-height: 0; }
  .lateral { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--borde); padding-bottom: 0; }
  .lat-lista { flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 8px; }
  .detalle { display: flex; flex-direction: column; min-height: 0; padding: 20px 24px 0; }
  .detalle-vacio { display: grid; flex: 1; place-content: center; text-align: center; color: var(--suave); padding-bottom: 80px; }
  .detalle-vacio h2 { margin: 0 0 6px; font-size: 1.1rem; color: var(--texto); }
  .detalle-vacio p { margin: 0; }
  .solo-movil, .volver.solo-movil { display: none; }
  .flecha { display: none; }
  .chip { min-height: 36px; padding: 0 12px; }
  .boton { min-height: 38px; padding: 0 16px; }
  input[type="date"], input[type="search"] { min-height: 38px; }
  #vista { display: block; flex: 1; min-height: 0; margin: 14px -24px 0; border-top: 1px solid var(--borde); background: var(--bg); }
  #vista[hidden] { display: none !important; }
  #marco { display: block; width: 100%; height: 100%; border: 0; background: var(--bg); color-scheme: light dark; }
  #vista-ayuda { flex: 1; display: grid; place-content: center; text-align: center; color: var(--suave); padding-bottom: 80px; margin: 0; }
}
@media (min-width: 900px) { #vista-ayuda[hidden] { display: none !important; } }
@media (max-width: 899px) { #vista-ayuda { display: none; } }
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;

const JS_LISTA = String.raw`
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  // Filtro local: sin red. Ignora mayúsculas y acentos.
  const sinAcentos = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const LIMITE = 40;
  const entrada = $('#buscar');
  const mas = $('#mas');
  if (!entrada) return;
  let limite = LIMITE;
  const filtroActual = () => (document.querySelector('input[name="filtro"]:checked') || {}).value || 'todos';
  function buscar(reiniciar) {
    if (reiniciar) limite = LIMITE;
    const q = sinAcentos(entrada.value.trim());
    const filtro = filtroActual();
    let total = 0, mostradas = 0;
    $$('#lista li').forEach((f) => {
      if (f._k === undefined) f._k = sinAcentos(f.dataset.buscar);
      const tipoOk = filtro === 'todos' || (filtro === 'grupos') === (f.dataset.tipo === 'grupo');
      const ok = tipoOk && (q === '' || f._k.includes(q));
      if (ok) total += 1;
      f.hidden = !ok || mostradas >= limite;
      if (ok && mostradas < limite) mostradas += 1;
    });
    const ayuda = $('#ayuda-busqueda');
    if (total === 0) ayuda.textContent = 'Sin coincidencias. Prueba con otra parte del nombre o del número.';
    else if (total > mostradas) ayuda.textContent = 'Mostrando ' + mostradas + ' de ' + total + '.';
    else ayuda.textContent = total + (total === 1 ? ' chat.' : ' chats.');
    mas.hidden = total <= mostradas;
  }
  // Al cambiar de chat la página se recarga: se recuerda el scroll y la búsqueda de la lista.
  const lista = $('.lat-lista');
  try {
    const guardado = JSON.parse(sessionStorage.getItem('lateral') || '{}');
    if (guardado.q) entrada.value = guardado.q;
    if (guardado.f) { const r = document.querySelector('input[name="filtro"][value="' + guardado.f + '"]'); if (r) r.checked = true; }
  } catch { /* sin almacenamiento: no pasa nada */ }
  entrada.addEventListener('input', () => buscar(true));
  $$('input[name="filtro"]').forEach((x) => x.addEventListener('change', () => buscar(true)));
  mas.addEventListener('click', () => { limite += LIMITE; buscar(false); });
  buscar(true);
  if (lista) {
    try { lista.scrollTop = Number(JSON.parse(sessionStorage.getItem('lateral') || '{}').y) || 0; } catch { /* igual */ }
    const activa = $('.fila[aria-current="page"]');
    if (activa && !(lista.scrollTop > 0)) activa.scrollIntoView({ block: 'center' });
    $$('.fila').forEach((a) => a.addEventListener('click', () => {
      try { sessionStorage.setItem('lateral', JSON.stringify({ y: lista.scrollTop, q: entrada.value, f: filtroActual() })); } catch { /* igual */ }
    }));
  }
})();
`;

const JS_CHAT = String.raw`
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const post = (ruta, cuerpo) => fetch(ruta, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  const form = $('#form-resumen');
  const estado = $('#estado');
  function mensaje(tipo, texto) {
    estado.replaceChildren();
    const m = document.createElement('div');
    m.className = 'msg ' + tipo;
    m.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    const p = document.createElement('p');
    p.textContent = texto;
    m.append(p);
    estado.append(m);
    return m;
  }
  // Si algo falla en el navegador, que se vea escrito en pantalla en vez de quedarse mudo.
  window.addEventListener('error', (e) => mensaje('error', 'Error en la página: ' + e.message + '. Recárgala; si sigue igual, avisa a quien la mantiene.'));
  window.addEventListener('unhandledrejection', () => mensaje('error', 'Algo falló al comunicarse con el servicio. Recarga la página e intenta de nuevo.'));

  const escritorio = () => window.matchMedia('(min-width: 900px)').matches;
  // En escritorio el resultado se muestra a la derecha; en móvil se navega en la misma pestaña.
  function abrir(url) {
    if (!escritorio()) { window.location.href = url; return false; }
    $('#marco').src = url;
    $('#vista').hidden = false;
    const ayuda = $('#vista-ayuda');
    if (ayuda) ayuda.hidden = true;
    return true;
  }

  const rango = $('#rango');
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dia = (mas) => { const d = new Date(); d.setDate(d.getDate() + mas); return d; };
  form.elements.desde.value = form.elements.hasta.value = iso(dia(0));
  const alternar = () => { rango.hidden = form.elements.periodo.value !== 'rango'; };
  $$('input[name="periodo"]').forEach((r) => r.addEventListener('change', alternar));
  // "Usar el último día con mensajes": deja el rango en ese día.
  const sugerido = $('[data-dia]');
  if (sugerido) sugerido.addEventListener('click', () => {
    $('#p-rango').checked = true;
    form.elements.desde.value = form.elements.hasta.value = sugerido.dataset.dia;
    alternar();
    $('#generar').focus();
  });
  function periodo() {
    const v = form.elements.periodo.value;
    if (v === 'hoy') return [iso(dia(0)), iso(dia(0)), 'hoy'];
    if (v === 'ayer') return [iso(dia(-1)), iso(dia(-1)), 'ayer'];
    if (v === '7dias') return [iso(dia(-6)), iso(dia(0)), 'los últimos 7 días'];
    return [form.elements.desde.value, form.elements.hasta.value, 'ese rango'];
  }
  function validar() {
    const [desde, hasta, cuando] = periodo();
    if (!desde || !hasta) { mensaje('error', 'Elige las dos fechas del rango.'); return null; }
    if (desde > hasta) { mensaje('error', 'La fecha inicial no puede ser posterior a la final.'); return null; }
    return { desde, hasta, cuando };
  }
  $('#ver-conversacion').addEventListener('click', () => {
    const p = validar();
    if (!p) return;
    const q = new URLSearchParams({ chat: form.dataset.chat, desde: p.desde, hasta: p.hasta });
    abrir('/conversacion?' + q.toString());
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = validar();
    if (!p) return;
    const boton = $('#generar');
    boton.disabled = true;
    boton.dataset.cargando = 'true';
    boton.textContent = 'Generando…';
    mensaje('', 'Transcribiendo audios y armando el resumen. Puede tardar hasta un minuto.');
    try {
      const r = await post('/resumen', { chat: form.dataset.chat, desde: p.desde, hasta: p.hasta });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '');
      if (escritorio()) {
        estado.replaceChildren();
        abrir(d.url);
      } else {
        const m = mensaje('ok', 'Resumen de ' + form.dataset.nombre + ' de ' + p.cuando + ' listo.');
        const a = document.createElement('a');
        a.className = 'boton primario';
        a.href = d.url;
        a.textContent = 'Abrir reporte';
        m.append(a);
        a.focus();
      }
    } catch (err) {
      mensaje('error', 'No se pudo generar el resumen. Intenta de nuevo; si sigue fallando, revisa que el servicio esté encendido.');
    } finally {
      boton.disabled = false;
      delete boton.dataset.cargando;
      boton.textContent = 'Generar resumen';
    }
  });
})();
`;

const GLOBO = '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 12h5"/>';
const svg = (interior) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${interior}</svg>`;
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#18181b"/><g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${GLOBO}</g></svg>`);
const ICONO_GRUPO = '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.4.2 4.2 1.9 4.7 4.3"/>';
const ICONO_BUSCAR = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const ICONO_FLECHA = svg('<path d="m9 6 6 6-6 6"/>').replace('<svg ', '<svg class="flecha" ');
const ICONO_ATRAS = svg('<path d="m15 6-6 6 6 6"/>');

function inicial(nombre) {
  const m = String(nombre ?? '').trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase('es') : '#';
}

function documento(titulo, cuerpo, scripts) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escaparHtml(titulo)}</title>
<link rel="icon" href="${FAVICON}">
<style>${CSS}</style>
</head>
<body>
${cuerpo}
${scripts}
</body>
</html>`;
}

const pie = (version) => `<footer class="pie">Resumen de WhatsApp v${escaparHtml(version)} · Desarrollado por JP</footer>`;

const plural = (n) => `${n} ${n === 1 ? 'mensaje' : 'mensajes'}`;

function fila(c, ahora, activo) {
  const nombre = escaparHtml(c.nombre);
  const href = escaparHtml(`/chat?chat=${encodeURIComponent(c.jid)}`);
  const buscar = escaparHtml(`${c.nombre} ${c.numero ?? ''}`);
  const detalle = `${etiquetaReciente(c.ultimo, ahora)} · ${plural(c.total)}`;
  return `<li data-buscar="${buscar}" data-tipo="${c.esGrupo ? 'grupo' : 'persona'}"><a class="fila" href="${href}"${activo ? ' aria-current="page"' : ''}>
<span class="avatar" aria-hidden="true">${c.esGrupo ? svg(ICONO_GRUPO) : escaparHtml(inicial(c.nombre))}</span>
<span class="datos"><span class="nombre">${nombre}</span><span class="detalle-fila">${escaparHtml(detalle)}</span></span>
${ICONO_FLECHA}</a></li>`;
}

// La columna izquierda: buscador, filtro y lista. Igual en la pantalla inicial y en cada chat.
function lateral(chats, version, aviso, ahora, activo) {
  const cuerpo = chats.length === 0
    ? `<div class="vacio"><p><strong>Todavía no hay mensajes guardados.</strong></p><p class="suave">Aparecen aquí en cuanto WhatsApp manda los primeros chats al servicio.</p></div>`
    : `<div class="lat-cuerpo"><label class="solo-lectores" for="buscar">Buscar entre ${chats.length} ${chats.length === 1 ? 'chat' : 'chats'}</label>
<div class="busca">${ICONO_BUSCAR}<input type="search" id="buscar" placeholder="Buscar entre ${chats.length} ${chats.length === 1 ? 'chat' : 'chats'}" autocomplete="off" enterkeyhint="search"></div>
<fieldset class="filtros"><legend class="solo-lectores">Tipo de chat</legend>
<div class="chips">
<input type="radio" name="filtro" value="todos" id="f-todos" checked><label class="chip" for="f-todos">Todos</label>
<input type="radio" name="filtro" value="personas" id="f-personas"><label class="chip" for="f-personas">Personas</label>
<input type="radio" name="filtro" value="grupos" id="f-grupos"><label class="chip" for="f-grupos">Grupos</label>
</div></fieldset>
<p class="suave" id="ayuda-busqueda" aria-live="polite"></p></div>
<div class="lat-lista"><ul class="filas" id="lista">
${chats.map((c) => fila(c, ahora, c.jid === activo)).join('\n')}
</ul>
<button type="button" class="boton secundario" id="mas" hidden>Mostrar más</button></div>`;
  return `<aside class="lateral" aria-label="Chats">
<div class="lat-cab"><span class="logo">${svg(GLOBO)}</span><p class="marca"><a href="/">Resumen de WhatsApp</a></p></div>
<div class="aviso-global"><p id="aviso" class="msg error" role="alert"${aviso ? '' : ' hidden'}>${escaparHtml(aviso)}</p></div>
${cuerpo}
${pie(version)}
</aside>`;
}

// chats: [{ jid, nombre, numero?, esGrupo, total, ultimo }] ya ordenados, el más reciente primero.
export function pagina(chats, version, aviso = '', ahora = new Date()) {
  const cuerpo = `<div class="app">
${lateral(chats, version, aviso, ahora, null)}
<main class="detalle detalle-vacio solo-escritorio"><div><h2>Elige un chat</h2><p>Su resumen o su conversación aparecen aquí.</p></div></main>
</div>`;
  return documento('Resumen de WhatsApp', cuerpo, `<script>${JS_LISTA}</script>`);
}

// c: { jid, nombre, esGrupo, total, primero, ultimo, hoy }  hoy: ¿hay mensajes de hoy?
// chats: la misma lista de la pantalla inicial, para mostrarla a la izquierda.
export function paginaChat(c, version, ahora = new Date(), chats = []) {
  const nombre = escaparHtml(c.nombre);
  const meta = `${plural(c.total)}, ${escaparHtml(etiquetaRango(c.primero, c.ultimo))}`;
  const dia = diaLocal(c.ultimo);
  const sugerencia = c.hoy ? '' : `<p class="ultimo">Hoy no hay mensajes. El último fue ${escaparHtml(etiquetaReciente(c.ultimo, ahora))}. <button type="button" class="enlace" data-dia="${escaparHtml(dia)}">Usar ese día</button></p>`;
  const cuerpo = `<div class="app con-chat">
${lateral(chats, version, '', ahora, c.jid)}
<main class="detalle">
<a class="volver solo-movil" href="/">${ICONO_ATRAS}Todos los chats</a>
<div class="det-cab"><h1>${nombre}</h1><p class="suave">${meta}</p></div>
<form id="form-resumen" data-chat="${escaparHtml(c.jid)}" data-nombre="${nombre}" novalidate aria-label="Pedir un resumen">
<div class="barra-form">
<fieldset><legend class="solo-lectores">Periodo</legend>
<div class="chips">
<input type="radio" name="periodo" value="hoy" id="p-hoy" checked><label class="chip" for="p-hoy">Hoy</label>
<input type="radio" name="periodo" value="ayer" id="p-ayer"><label class="chip" for="p-ayer">Ayer</label>
<input type="radio" name="periodo" value="7dias" id="p-7dias"><label class="chip" for="p-7dias">7 días</label>
<input type="radio" name="periodo" value="rango" id="p-rango"><label class="chip" for="p-rango">Otro rango</label>
</div></fieldset>
<div class="acciones-form">
<button type="submit" class="boton primario" id="generar">Generar resumen</button>
<button type="button" class="boton secundario" id="ver-conversacion">Ver conversación</button>
</div>
</div>
${sugerencia}
<div id="rango" hidden>
<div class="campo"><label for="desde">Desde</label><input type="date" id="desde" name="desde"></div>
<div class="campo"><label for="hasta">Hasta</label><input type="date" id="hasta" name="hasta"></div>
</div>
<div id="estado" aria-live="polite"></div>
</form>
<p id="vista-ayuda">Elige el periodo y pide el resumen o abre la conversación.<br>Aparece aquí.</p>
<div id="vista" hidden><iframe id="marco" title="Resumen o conversación"></iframe></div>
</main>
</div>`;
  return documento(c.nombre, cuerpo, `<script>${JS_LISTA}</script>\n<script>${JS_CHAT}</script>`);
}
