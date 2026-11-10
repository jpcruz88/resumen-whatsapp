// Página del panel. Modo "operar": la tarea principal (pedir un resumen) va primero y a la vista;
// elegir chats es la configuración. Una sola pieza, sin dependencias: HTML + CSS + JS en línea.
// Los datos del servidor llegan solo por atributos ya escapados; el JS no inyecta HTML con datos ajenos.
import { escaparHtml } from './reporte.js';

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
.barra-int { max-width: 1040px; margin: 0 auto; padding: 12px 16px 0; }
.marca { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
.logo { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--acento); color: var(--sobre-acento); }
.logo svg { width: 20px; height: 20px; }
h1 { margin: 0; font-size: 1.25rem; font-weight: 650; letter-spacing: -0.01em; }
.pestanas { display: flex; gap: 4px; }
.pestana {
  flex: 1; min-height: 44px; padding: 0 12px; background: none; border: 0; border-bottom: 3px solid transparent;
  color: var(--suave); font-weight: 600; cursor: pointer; transition: color .15s, border-color .15s;
}
.pestana[aria-selected="true"] { color: var(--texto); border-bottom-color: var(--acento); }
.pestana:hover { color: var(--texto); }

main { max-width: 1040px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
.panel { background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); padding: 18px 16px; }
.panel[data-activa="false"] { display: none; }
h2 { margin: 0 0 4px; font-size: 1.125rem; font-weight: 650; }
h3 { margin: 22px 0 8px; font-size: 1rem; font-weight: 650; }
.suave { color: var(--suave); font-size: .9rem; margin: 0 0 14px; }

.campo { display: grid; gap: 6px; margin-bottom: 16px; }
label, legend { font-weight: 600; font-size: .9rem; }
fieldset { border: 0; margin: 0 0 16px; padding: 0; min-width: 0; }
legend { padding: 0; margin-bottom: 6px; }
select, input[type="date"], input[type="search"] {
  width: 100%; min-height: 44px; padding: 8px 12px; background: var(--superficie);
  border: 1px solid var(--borde); border-radius: var(--radio-s);
}
select:hover, input:hover { border-color: var(--suave); }

.chips { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.chips input { position: absolute; opacity: 0; pointer-events: none; }
.chip {
  display: grid; place-items: center; min-height: 44px; padding: 0 10px; text-align: center;
  border: 1px solid var(--borde); border-radius: var(--radio-s); font-weight: 600; cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.chip:hover { border-color: var(--suave); }
.chips input:checked + .chip { background: var(--acento); border-color: var(--acento); color: var(--sobre-acento); }
.chips input:focus-visible + .chip { outline: 2px solid var(--acento); outline-offset: 2px; }
#rango { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
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
.boton:disabled { opacity: .55; cursor: not-allowed; }
.boton[data-cargando="true"]::before {
  content: ""; width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid currentColor; border-right-color: transparent; animation: gira .8s linear infinite;
}
@keyframes gira { to { transform: rotate(360deg); } }

#estado { margin-top: 14px; min-height: 0; }
#estado:empty { display: none; }
.msg { padding: 12px 14px; border-radius: var(--radio-s); background: var(--superficie-2); font-size: .95rem; }
.msg.error { background: var(--error-suave); color: var(--error); }
.msg.ok { background: var(--acento-suave); }
.msg p { margin: 0 0 10px; }
.msg .boton { width: 100%; }

.vacio { text-align: left; padding: 6px 0 2px; }
.vacio p { margin: 0 0 14px; }

.busca { position: relative; }
.busca svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--suave); pointer-events: none; }
.busca input { padding-left: 38px; }
#ayuda-busqueda { margin: 8px 0 4px; }

.filas { list-style: none; margin: 0; padding: 0; }
.filas li { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 8px 0; border-top: 1px solid var(--borde); }
.filas li:first-child { border-top: 0; }
.avatar {
  flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%;
  background: var(--acento-suave); color: var(--texto); font-weight: 650;
}
.datos { flex: 1; min-width: 0; display: grid; }
.nombre { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font-weight: 600; line-height: 1.3; }
.numero { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--suave); font-size: .85rem; font-variant-numeric: tabular-nums; }
.filas .boton { flex: none; min-height: 44px; padding: 0 14px; font-size: .9rem; }

.pie { max-width: 1040px; margin: 8px auto 28px; padding: 0 16px max(0px, env(safe-area-inset-bottom)); color: var(--suave); font-size: .85rem; }

@media (min-width: 900px) {
  .pestanas { display: none; }
  .barra-int { padding-bottom: 12px; }
  .marca { margin: 0; }
  main { grid-template-columns: minmax(340px, 420px) 1fr; align-items: start; padding-top: 24px; }
  .panel, .panel[data-activa="false"] { display: block; }
  #vista-resumen { position: sticky; top: 76px; }
  .panel { padding: 22px 20px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;

const JS = String.raw`
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  // Filtro local: sin red. Ignora mayúsculas y acentos.
  const sinAcentos = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const post = (ruta, cuerpo) => fetch(ruta, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
  });

  // ---- Pestañas (en pantalla ancha se ven las dos vistas y las pestañas se ocultan) ----
  const vistas = { resumen: $('#vista-resumen'), chats: $('#vista-chats') };
  const pestanas = $$('[role="tab"]');
  const cuenta = () => $$('#lista-vigilados li').length;
  function mostrar(nombre) {
    Object.keys(vistas).forEach((k) => { vistas[k].dataset.activa = String(k === nombre); });
    pestanas.forEach((p) => {
      const activa = p.dataset.vista === nombre;
      p.setAttribute('aria-selected', String(activa));
      p.tabIndex = activa ? 0 : -1;
    });
    history.replaceState(null, '', '#' + nombre);
  }
  pestanas.forEach((p, i) => {
    p.addEventListener('click', () => mostrar(p.dataset.vista));
    p.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const otra = pestanas[(i + 1) % pestanas.length];
      otra.focus(); mostrar(otra.dataset.vista);
    });
  });
  $$('[data-ir]').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.ir)));
  const hash = location.hash.slice(1);
  mostrar(hash === 'resumen' || hash === 'chats' ? hash : (cuenta() > 0 ? 'resumen' : 'chats'));

  // ---- Buscar entre todos los contactos (muestra pocos a la vez) ----
  const LIMITE = 30;
  const entrada = $('#buscar');
  function buscar() {
    const q = sinAcentos(entrada.value.trim());
    const ayuda = $('#ayuda-busqueda');
    const filas = $$('#lista-resultados li');
    if (q.length < 2) {
      filas.forEach((f) => { f.hidden = true; });
      ayuda.textContent = 'Escribe al menos 2 letras o números para buscar.';
      return;
    }
    let total = 0, mostradas = 0;
    filas.forEach((f) => {
      if (f._k === undefined) f._k = sinAcentos(f.dataset.buscar);
      const ok = f._k.includes(q);
      if (ok) total += 1;
      f.hidden = !ok || mostradas >= LIMITE;
      if (ok && mostradas < LIMITE) mostradas += 1;
    });
    ayuda.textContent = total === 0
      ? 'Sin coincidencias. Prueba con otra parte del nombre o del número.'
      : total > LIMITE
        ? 'Mostrando ' + LIMITE + ' de ' + total + '. Sigue escribiendo para acotar.'
        : total + (total === 1 ? ' coincidencia.' : ' coincidencias.');
  }
  entrada.addEventListener('input', buscar);
  buscar();

  // ---- Vigilar / dejar de vigilar ----
  function avisar(texto) {
    const a = $('#aviso');
    a.textContent = texto;
    a.hidden = !texto;
  }
  function sincronizarSelector(li, activo) {
    const sel = $('#chat');
    if (!sel) return;
    const jid = li.dataset.chat;
    const previa = $$('option', sel).find((o) => o.value === jid);
    if (!activo) { if (previa) previa.remove(); return; }
    if (previa) return;
    const o = document.createElement('option');
    o.value = jid; o.textContent = $('.nombre', li).textContent;
    const despues = $$('option', sel).find((x) => x.textContent.localeCompare(o.textContent, 'es') > 0);
    sel.insertBefore(o, despues || null);
  }
  function mover(li, activo) {
    const antes = cuenta();
    const boton = $('button', li);
    const nombre = $('.nombre', li).textContent;
    boton.dataset.accion = activo ? 'quitar' : 'vigilar';
    boton.textContent = activo ? 'Dejar de vigilar' : 'Vigilar';
    boton.setAttribute('aria-label', (activo ? 'Dejar de vigilar ' : 'Vigilar ') + nombre);
    boton.className = 'boton secundario';
    boton.disabled = false;
    li.hidden = false;
    if (activo) {
      const lista = $('#lista-vigilados');
      const despues = $$('li', lista).find((x) => $('.nombre', x).textContent.localeCompare(nombre, 'es') > 0);
      lista.insertBefore(li, despues || null);
    } else {
      $('#lista-resultados').prepend(li);
    }
    sincronizarSelector(li, activo);
    $('#cuenta-vigilados').textContent = String(cuenta());
    $('#vigilados-vacio').hidden = cuenta() > 0;
    buscar();
    // Al pasar de 0 a 1 chat (o de 1 a 0) cambia qué se muestra en "Resumen": se recarga esa vista.
    if ((antes === 0) !== (cuenta() === 0)) location.reload();
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    const li = b.closest('li');
    const activo = b.dataset.accion === 'vigilar';
    b.disabled = true;
    avisar('');
    try {
      const r = await post('/vigilar', { chat: li.dataset.chat, activo });
      if (!r.ok) throw new Error('fallo');
      mover(li, activo);
    } catch (_) {
      b.disabled = false;
      avisar('No se pudo guardar el cambio. Revisa la conexión e intenta de nuevo.');
    }
  });

  // ---- Pedir un resumen ----
  const form = $('#form-resumen');
  if (!form) return;
  const rango = $('#rango');
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dia = (mas) => { const d = new Date(); d.setDate(d.getDate() + mas); return d; };
  form.elements.desde.value = form.elements.hasta.value = iso(dia(0));
  $$('input[name="periodo"]').forEach((r) => r.addEventListener('change', () => {
    rango.hidden = form.elements.periodo.value !== 'rango';
  }));
  function periodo() {
    const v = form.elements.periodo.value;
    if (v === 'hoy') return [iso(dia(0)), iso(dia(0)), 'hoy'];
    if (v === 'ayer') return [iso(dia(-1)), iso(dia(-1)), 'ayer'];
    if (v === '7dias') return [iso(dia(-6)), iso(dia(0)), 'los últimos 7 días'];
    return [form.elements.desde.value, form.elements.hasta.value, 'ese rango'];
  }
  const estado = $('#estado');
  function mensaje(tipo, texto) {
    estado.replaceChildren();
    const m = document.createElement('div');
    m.className = 'msg ' + tipo;
    const p = document.createElement('p');
    p.textContent = texto;
    m.append(p);
    estado.append(m);
    return m;
  }
  function amigable(error) {
    if (error === 'chat no vigilado') return 'Ese chat ya no está vigilado. Actívalo en Chats y vuelve a intentar.';
    return 'No se pudo generar el resumen. Intenta de nuevo; si sigue fallando, revisa que el servicio esté encendido.';
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const [desde, hasta, cuando] = periodo();
    if (!desde || !hasta) { mensaje('error', 'Elige las dos fechas del rango.'); return; }
    if (desde > hasta) { mensaje('error', 'La fecha inicial no puede ser posterior a la final.'); return; }
    const boton = $('#generar');
    boton.disabled = true;
    boton.dataset.cargando = 'true';
    boton.textContent = 'Generando…';
    mensaje('', 'Transcribiendo audios y armando el resumen. Puede tardar hasta un minuto.');
    try {
      const r = await post('/resumen', { chat: form.elements.chat.value, desde, hasta });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '');
      const nombre = form.elements.chat.selectedOptions[0].textContent;
      const m = mensaje('ok', 'Resumen de ' + nombre + ' de ' + cuando + ' listo.');
      const a = document.createElement('a');
      a.className = 'boton primario';
      a.href = d.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Abrir reporte';
      m.append(a);
      a.focus();
    } catch (err) {
      mensaje('error', amigable(err.message));
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
const ICONO_BUSCAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

function inicial(nombre) {
  const m = String(nombre ?? '').trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase('es') : '#';
}

function numero(jid) {
  const [id, dominio] = String(jid).split('@');
  return dominio === 's.whatsapp.net' ? `+${id}` : 'Número oculto por WhatsApp';
}

function fila(c, vigilado) {
  const jid = escaparHtml(c.jid);
  const nombre = escaparHtml(c.nombre || c.jid);
  const buscar = escaparHtml(`${c.nombre || ''} ${c.jid}`);
  const accion = vigilado ? 'quitar' : 'vigilar';
  const texto = vigilado ? 'Dejar de vigilar' : 'Vigilar';
  const oculto = vigilado ? '' : ' hidden';
  return `<li data-buscar="${buscar}" data-chat="${jid}"${oculto}>
<span class="avatar" aria-hidden="true">${escaparHtml(inicial(c.nombre))}</span>
<span class="datos"><span class="nombre">${nombre}</span><span class="numero">${escaparHtml(numero(c.jid))}</span></span>
<button type="button" class="boton secundario" data-accion="${accion}" aria-label="${texto} ${nombre}">${texto}</button>
</li>`;
}

export function pagina(chats, vigilados, version) {
  const vig = new Set(vigilados);
  const deLaLista = chats.filter((c) => vig.has(c.jid));
  const resto = chats.filter((c) => !vig.has(c.jid));
  const n = deLaLista.length;

  const opciones = deLaLista
    .map((c) => `<option value="${escaparHtml(c.jid)}">${escaparHtml(c.nombre || c.jid)}</option>`)
    .join('\n');

  const resumen = n > 0
    ? `<form id="form-resumen" novalidate>
<div class="campo"><label for="chat">Chat</label>
<select id="chat" name="chat">
${opciones}
</select></div>
<fieldset><legend>Periodo</legend>
<div class="chips">
<input type="radio" name="periodo" value="hoy" id="p-hoy" checked><label class="chip" for="p-hoy">Hoy</label>
<input type="radio" name="periodo" value="ayer" id="p-ayer"><label class="chip" for="p-ayer">Ayer</label>
<input type="radio" name="periodo" value="7dias" id="p-7dias"><label class="chip" for="p-7dias">7 días</label>
<input type="radio" name="periodo" value="rango" id="p-rango"><label class="chip" for="p-rango">Otro rango</label>
</div></fieldset>
<div id="rango" hidden>
<div class="campo"><label for="desde">Desde</label><input type="date" id="desde" name="desde"></div>
<div class="campo"><label for="hasta">Hasta</label><input type="date" id="hasta" name="hasta"></div>
</div>
<button type="submit" id="generar" class="boton primario">Generar resumen</button>
<div id="estado" aria-live="polite" role="status"></div>
</form>`
    : `<div class="vacio">
<p><strong>Aún no vigilas ningún chat.</strong></p>
<p class="suave">Elige al menos uno en Chats para poder pedir su resumen.</p>
<button type="button" class="boton secundario" data-ir="chats">Elegir chats</button>
</div>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f3f6f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1311" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${FAVICON}">
<title>Resumen de WhatsApp</title>
<style>${CSS}</style>
</head>
<body>
<header class="barra"><div class="barra-int">
<div class="marca"><span class="logo">${svg(GLOBO)}</span><h1>Resumen de WhatsApp</h1></div>
<div class="pestanas" role="tablist" aria-label="Secciones">
<button type="button" class="pestana" role="tab" id="t-resumen" data-vista="resumen" aria-controls="vista-resumen" aria-selected="false">Resumen</button>
<button type="button" class="pestana" role="tab" id="t-chats" data-vista="chats" aria-controls="vista-chats" aria-selected="false">Chats</button>
</div>
</div></header>
<main>
<section class="panel" id="vista-resumen" role="tabpanel" aria-labelledby="t-resumen" data-activa="true">
<h2>Generar resumen</h2>
<p class="suave">Tareas, temas de trabajo y temas personales de un chat vigilado.</p>
${resumen}
</section>
<section class="panel" id="vista-chats" role="tabpanel" aria-labelledby="t-chats" data-activa="false">
<h2>Chats vigilados (<span id="cuenta-vigilados">${n}</span>)</h2>
<p class="suave">Solo de estos chats se guardan mensajes, audios e imágenes.</p>
<p id="vigilados-vacio" class="suave"${n > 0 ? ' hidden' : ''}>Todavía no hay chats vigilados.</p>
<ul class="filas" id="lista-vigilados">
${deLaLista.map((c) => fila(c, true)).join('\n')}
</ul>
<h3>Agregar un chat</h3>
<div class="campo"><label for="buscar">Buscar entre ${chats.length} contactos</label>
<div class="busca">${ICONO_BUSCAR}<input type="search" id="buscar" placeholder="Nombre o número" autocomplete="off" enterkeyhint="search"></div></div>
<p id="ayuda-busqueda" class="suave" aria-live="polite"></p>
<p id="aviso" class="msg error" role="alert" hidden></p>
<ul class="filas" id="lista-resultados">
${resto.map((c) => fila(c, false)).join('\n')}
</ul>
</section>
</main>
<footer class="pie">Resumen de WhatsApp v${escaparHtml(version)} · Desarrollado por JP</footer>
<noscript><p class="pie">Activa JavaScript para usar el panel.</p></noscript>
<script>${JS}</script>
</body>
</html>
`;
}
