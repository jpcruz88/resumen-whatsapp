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
  --bg: #f3f6f5; --superficie: #ffffff; --superficie-2: #eaf0ee;
  --texto: #142420; --suave: #51615c; --borde: #d3ddd9;
  --acento: #0b6e63; --acento-hover: #095b52; --sobre-acento: #ffffff; --acento-suave: #d9efea;
  --error: #a8261e; --error-suave: #fbe9e7;
  --radio: 12px; --radio-s: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1311; --superficie: #151d1a; --superficie-2: #1d2824;
    --texto: #e8f0ed; --suave: #9db0a9; --borde: #2b3a35;
    --acento: #3ccbb6; --acento-hover: #5ad9c6; --sobre-acento: #04211c; --acento-suave: #143a34;
    --error: #ff9a90; --error-suave: #3a1c19;
  }
}
* { box-sizing: border-box; }
html { scrollbar-color: var(--borde) transparent; -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--texto);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  accent-color: var(--acento);
}
::selection { background: var(--acento-suave); color: var(--texto); }
input, select, button { font: inherit; color: inherit; caret-color: var(--acento); }
:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
[hidden] { display: none !important; }

.barra { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--borde); }
.barra-int { max-width: 720px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
.logo { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--acento); color: var(--sobre-acento); }
.logo svg { width: 20px; height: 20px; }
.marca { margin: 0; font-size: 1.125rem; font-weight: 650; letter-spacing: -0.01em; }
.marca a { color: inherit; text-decoration: none; }

main { max-width: 720px; margin: 0 auto; padding: 16px; }
h1 { margin: 0 0 4px; font-size: 1.5rem; line-height: 1.25; font-weight: 700; letter-spacing: -0.015em; overflow-wrap: anywhere; text-wrap: balance; }
h2 { margin: 0 0 8px; font-size: 1.0625rem; font-weight: 650; }
.suave { color: var(--suave); font-size: .9rem; margin: 0 0 16px; }
.volver { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; margin: 0 0 4px -4px; padding: 0 4px; color: var(--suave); font-weight: 600; text-decoration: none; }
.volver:hover { color: var(--texto); }
.volver svg { width: 18px; height: 18px; }

.aviso-global { max-width: 720px; margin: 12px auto 0; padding: 0 16px; }
.aviso-global .msg { margin: 0; }
.msg { padding: 12px 14px; border-radius: var(--radio-s); background: var(--superficie-2); font-size: .95rem; }
.msg.error { background: var(--error-suave); color: var(--error); }
.msg.ok { background: var(--acento-suave); }
.msg p { margin: 0 0 10px; }
.msg .boton { width: 100%; }

.campo { display: grid; gap: 6px; margin-bottom: 16px; }
label, legend { font-weight: 600; font-size: .9rem; }
fieldset { border: 0; margin: 0 0 16px; padding: 0; min-width: 0; }
legend { padding: 0; margin-bottom: 6px; }
input[type="date"], input[type="search"] {
  width: 100%; min-width: 0; min-height: 44px; padding: 8px 12px; background: var(--superficie);
  border: 1px solid var(--borde); border-radius: var(--radio-s);
}
input:hover { border-color: var(--suave); }
.busca { position: relative; }
.busca svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--suave); pointer-events: none; }
.busca input { padding-left: 38px; }

.chips { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.chips.tres { grid-template-columns: repeat(3, 1fr); }
.chips input { position: absolute; opacity: 0; pointer-events: none; }
.chip {
  display: grid; place-items: center; min-height: 44px; padding: 0 10px; text-align: center;
  border: 1px solid var(--borde); border-radius: var(--radio-s); background: var(--superficie); font-weight: 600; cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.chip:hover { border-color: var(--suave); }
.chips input:checked + .chip { background: var(--acento); border-color: var(--acento); color: var(--sobre-acento); }
.chips input:focus-visible + .chip { outline: 2px solid var(--acento); outline-offset: 2px; }
#rango { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-bottom: 16px; }
#rango .campo { margin: 0; }

.boton {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 18px;
  border-radius: var(--radio-s); border: 1px solid transparent; font-weight: 650; cursor: pointer; text-decoration: none;
  transition: background .15s, border-color .15s, opacity .15s;
}
.primario { width: 100%; background: var(--acento); color: var(--sobre-acento); }
.primario:hover:not(:disabled) { background: var(--acento-hover); }
.secundario { background: transparent; border-color: var(--borde); color: var(--texto); }
.secundario:hover:not(:disabled) { border-color: var(--suave); background: var(--superficie-2); }
.enlace { min-height: 44px; padding: 0; background: none; border: 0; color: var(--acento); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.boton:disabled { opacity: .55; cursor: not-allowed; }
.boton[data-cargando="true"]::before {
  content: ""; width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid currentColor; border-right-color: transparent; animation: gira .8s linear infinite;
}
@keyframes gira { to { transform: rotate(360deg); } }
.acciones-form { display: grid; gap: 10px; }
#estado { margin-top: 14px; }
#estado:empty { display: none; }
#mas { width: 100%; margin-top: 8px; }

.filtros { margin: 12px 0 8px; }
#ayuda-busqueda { margin: 0 0 4px; }
.filas { list-style: none; margin: 0; padding: 0; background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); overflow: hidden; }
.filas li + li { border-top: 1px solid var(--borde); }
.fila { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; color: inherit; text-decoration: none; }
.fila:hover { background: var(--superficie-2); }
.avatar {
  flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%;
  background: var(--acento-suave); color: var(--texto); font-weight: 650;
}
.avatar svg { width: 20px; height: 20px; }
.datos { flex: 1; min-width: 0; display: grid; }
.nombre { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font-weight: 600; line-height: 1.3; }
.detalle { color: var(--suave); font-size: .85rem; font-variant-numeric: tabular-nums; }
.flecha { flex: none; width: 20px; height: 20px; color: var(--suave); }
.vacio { padding: 18px 16px; background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); }
.vacio p { margin: 0 0 6px; }

.ficha { background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); padding: 18px 16px; margin-top: 16px; }
.ultimo { margin: -6px 0 16px; font-size: .9rem; color: var(--suave); }

.pie { max-width: 720px; margin: 8px auto 28px; padding: 0 16px max(0px, env(safe-area-inset-bottom)); color: var(--suave); font-size: .85rem; }
@media (min-width: 900px) {
  main { padding-top: 28px; }
  .ficha { padding: 22px 20px; }
  .acciones-form { grid-template-columns: 1fr 1fr; }
}
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
  entrada.addEventListener('input', () => buscar(true));
  $$('input[name="filtro"]').forEach((x) => x.addEventListener('change', () => buscar(true)));
  mas.addEventListener('click', () => { limite += LIMITE; buscar(false); });
  buscar(true);
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
    window.location.href = '/conversacion?' + q.toString();
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
      const m = mensaje('ok', 'Resumen de ' + form.dataset.nombre + ' de ' + p.cuando + ' listo.');
      const a = document.createElement('a');
      a.className = 'boton primario';
      a.href = d.url;
      a.textContent = 'Abrir reporte';
      m.append(a);
      a.focus();
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
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0b6e63"/><g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${GLOBO}</g></svg>`);
const ICONO_GRUPO = '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.4.2 4.2 1.9 4.7 4.3"/>';
const ICONO_BUSCAR = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const ICONO_FLECHA = svg('<path d="m9 6 6 6-6 6"/>').replace('<svg ', '<svg class="flecha" ');
const ICONO_ATRAS = svg('<path d="m15 6-6 6 6 6"/>');

function inicial(nombre) {
  const m = String(nombre ?? '').trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase('es') : '#';
}

function cabecera(titulo, extraHead = '') {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escaparHtml(titulo)}</title>
<link rel="icon" href="${FAVICON}">
<style>${CSS}</style>${extraHead}
</head>
<body>
<header class="barra"><div class="barra-int">
<span class="logo">${svg(GLOBO)}</span>
<p class="marca"><a href="/">Resumen de WhatsApp</a></p>
</div></header>`;
}

const pie = (version) => `<footer class="pie">Resumen de WhatsApp v${escaparHtml(version)} · Desarrollado por JP</footer>`;

const plural = (n) => `${n} ${n === 1 ? 'mensaje' : 'mensajes'}`;

function fila(c, ahora) {
  const nombre = escaparHtml(c.nombre);
  const href = escaparHtml(`/chat?chat=${encodeURIComponent(c.jid)}`);
  const buscar = escaparHtml(`${c.nombre} ${c.numero ?? ''}`);
  const detalle = `${etiquetaReciente(c.ultimo, ahora)} · ${plural(c.total)}`;
  return `<li data-buscar="${buscar}" data-tipo="${c.esGrupo ? 'grupo' : 'persona'}"><a class="fila" href="${href}">
<span class="avatar" aria-hidden="true">${c.esGrupo ? svg(ICONO_GRUPO) : escaparHtml(inicial(c.nombre))}</span>
<span class="datos"><span class="nombre">${nombre}</span><span class="detalle">${escaparHtml(detalle)}</span></span>
${ICONO_FLECHA}</a></li>`;
}

// chats: [{ jid, nombre, numero?, esGrupo, total, ultimo }] ya ordenados, el más reciente primero.
export function pagina(chats, version, aviso = '', ahora = new Date()) {
  const cuerpo = chats.length === 0
    ? `<div class="vacio"><p><strong>Todavía no hay mensajes guardados.</strong></p><p class="suave">Aparecen aquí en cuanto WhatsApp manda los primeros chats al servicio.</p></div>`
    : `<div class="campo"><label for="buscar">Buscar entre ${chats.length} ${chats.length === 1 ? 'chat' : 'chats'}</label>
<div class="busca">${ICONO_BUSCAR}<input type="search" id="buscar" placeholder="Nombre o número" autocomplete="off" enterkeyhint="search"></div></div>
<fieldset class="filtros"><legend class="solo-lectores" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Tipo de chat</legend>
<div class="chips tres">
<input type="radio" name="filtro" value="todos" id="f-todos" checked><label class="chip" for="f-todos">Todos</label>
<input type="radio" name="filtro" value="personas" id="f-personas"><label class="chip" for="f-personas">Personas</label>
<input type="radio" name="filtro" value="grupos" id="f-grupos"><label class="chip" for="f-grupos">Grupos</label>
</div></fieldset>
<p class="suave" id="ayuda-busqueda" aria-live="polite"></p>
<ul class="filas" id="lista">
${chats.map((c) => fila(c, ahora)).join('\n')}
</ul>
<button type="button" class="boton secundario" id="mas" hidden>Mostrar más</button>`;
  return `${cabecera('Resumen de WhatsApp')}
<div class="aviso-global"><p id="aviso" class="msg error" role="alert"${aviso ? '' : ' hidden'}>${escaparHtml(aviso)}</p></div>
<main>
<h1>Tus chats</h1>
<p class="suave">Elige uno para pedir su resumen o leer la conversación.</p>
${cuerpo}
</main>
${pie(version)}
<script>${JS_LISTA}</script>
</body>
</html>`;
}

// c: { jid, nombre, esGrupo, total, primero, ultimo, hoy }  hoy: ¿hay mensajes de hoy?
export function paginaChat(c, version, ahora = new Date()) {
  const nombre = escaparHtml(c.nombre);
  const meta = `${plural(c.total)}, ${escaparHtml(etiquetaRango(c.primero, c.ultimo))}`;
  const dia = diaLocal(c.ultimo);
  const sugerencia = c.hoy ? '' : `<p class="ultimo">Hoy no hay mensajes. El último fue ${escaparHtml(etiquetaReciente(c.ultimo, ahora))}. <button type="button" class="enlace" data-dia="${escaparHtml(dia)}">Usar ese día</button></p>`;
  return `${cabecera(c.nombre)}
<main>
<a class="volver" href="/">${ICONO_ATRAS}Todos los chats</a>
<h1>${nombre}</h1>
<p class="suave">${meta}</p>
<section class="ficha" aria-label="Pedir un resumen">
<form id="form-resumen" data-chat="${escaparHtml(c.jid)}" data-nombre="${nombre}" novalidate>
<fieldset><legend>Periodo</legend>
<div class="chips">
<input type="radio" name="periodo" value="hoy" id="p-hoy" checked><label class="chip" for="p-hoy">Hoy</label>
<input type="radio" name="periodo" value="ayer" id="p-ayer"><label class="chip" for="p-ayer">Ayer</label>
<input type="radio" name="periodo" value="7dias" id="p-7dias"><label class="chip" for="p-7dias">7 días</label>
<input type="radio" name="periodo" value="rango" id="p-rango"><label class="chip" for="p-rango">Otro rango</label>
</div></fieldset>
${sugerencia}
<div id="rango" hidden>
<div class="campo"><label for="desde">Desde</label><input type="date" id="desde" name="desde"></div>
<div class="campo"><label for="hasta">Hasta</label><input type="date" id="hasta" name="hasta"></div>
</div>
<div class="acciones-form">
<button type="submit" class="boton primario" id="generar">Generar resumen</button>
<button type="button" class="boton secundario" id="ver-conversacion">Ver conversación</button>
</div>
<div id="estado" aria-live="polite"></div>
</form>
</section>
</main>
${pie(version)}
<script>${JS_CHAT}</script>
</body>
</html>`;
}
