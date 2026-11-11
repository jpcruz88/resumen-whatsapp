// Página de conversación: los mensajes de un chat vigilado en un periodo, como se leen en el chat,
// con las imágenes a la vista y los audios con reproductor. No usa Gemini: lee del almacén local.
// Todo texto que viene de WhatsApp se escapa antes de llegar al HTML.
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { escaparHtml, ID_REPORTE } from './reporte.js';
import { inicioDelDia, finDelDia, etiquetaPeriodo, etiquetaRango, etiquetaDia } from './fechas.js';
import { BASE_CSS, FLECHA, ICONO_BUSCAR, ICONO_CHAT, ICONO_IMAGEN, ICONO_AUDIO } from './estilos.js';
import { conNombres } from './nombres.js';

export const POR_PAGINA = 300;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ID_MEDIO = /^[A-Za-z0-9_-]{1,100}$/;

const CSS = String.raw`
.ir-dia { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 12px; }
.ir-dia label { font-weight: 600; font-size: .9rem; flex-basis: 100%; }
.ir-dia input[type="date"] { flex: 1; min-width: 0; min-height: 44px; padding: 8px 12px; background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio-s); }
.ir-dia .boton { min-height: 44px; padding: 0 18px; }
.cabecera{margin:4px 0 12px}
h1{margin:4px 0 6px;font-size:1.6rem;line-height:1.2;letter-spacing:-.01em;overflow-wrap:anywhere}
.meta{margin:0;color:var(--suave);font-size:.95rem}
.herramientas{display:grid;gap:10px;margin:14px 0 6px}
.busca{position:relative}
.busca svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--suave);pointer-events:none}
.busca input{width:100%;min-height:44px;padding:8px 12px 8px 38px;background:var(--sup);color:inherit;font:inherit;border:1px solid var(--borde);border-radius:10px;caret-color:var(--acento)}
.chips{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border:0;margin:0;padding:0}
.chips input{position:absolute;opacity:0;pointer-events:none}
.chip{display:grid;place-items:center;min-height:44px;padding:0 10px;border:1px solid var(--borde);border-radius:10px;font-weight:600;cursor:pointer;background:var(--sup);transition:background .15s,border-color .15s,color .15s}
.chip:hover{border-color:var(--suave)}
.chips input:checked+.chip{background:var(--acento);border-color:var(--acento);color:var(--bg)}
.chips input:focus-visible+.chip{outline:2px solid var(--acento);outline-offset:2px}
.solo-lectores{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
#resultado{margin:6px 0 0;color:var(--suave);font-size:.9rem}
#resultado:empty{display:none}
.mensajes{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.mensajes li[hidden]{display:none}
.dia{align-self:center;margin:18px 0 6px;padding:4px 14px;border-radius:999px;background:var(--sup2);color:var(--suave);font-size:.85rem;font-weight:600;text-align:center}
.msg{max-width:88%;padding:8px 12px 6px;border-radius:14px;background:var(--sup);border:1px solid var(--borde);overflow-wrap:anywhere}
.msg.ajeno{align-self:flex-start;border-bottom-left-radius:4px}
.msg.propio{align-self:flex-end;background:var(--acento-suave);border-color:transparent;border-bottom-right-radius:4px}
.autor{display:block;margin-bottom:2px;font-size:.8rem;font-weight:650}
.t0{color:var(--t0)}.t1{color:var(--t1)}.t2{color:var(--t2)}.t3{color:var(--t3)}.t4{color:var(--t4)}
.texto{margin:0;white-space:pre-wrap}
.texto a{color:var(--acento);text-underline-offset:2px}
.msg time{display:block;margin-top:2px;text-align:right;color:var(--suave);font-size:.72rem;font-variant-numeric:tabular-nums}
.foto{display:block;margin:2px 0 4px}
.foto img{display:block;max-width:100%;max-height:340px;border-radius:10px;background:var(--sup2)}
audio{display:block;width:min(300px,100%);height:40px;margin:4px 0}
.transcripcion{margin:4px 0 0;color:var(--suave);font-size:.9rem}
.transcripcion strong{color:var(--texto)}
.sin-medio{display:flex;align-items:center;gap:10px;margin:2px 0 4px;padding:10px 12px;background:var(--sup2);border-radius:10px;color:var(--suave)}
.sin-medio svg{flex:none;width:22px;height:22px}
.sin-medio strong{display:block;color:var(--texto);font-size:.95rem}
.sin-medio span{font-size:.85rem}
.sin-medio p{margin:0}
.sin-medio.recuperable{flex-wrap:wrap}
.sin-medio.recuperable p{flex:1;min-width:10rem}
.cargar{min-height:44px;padding:0 14px;border:1px solid var(--borde);border-radius:10px;background:var(--sup);color:var(--texto);font:inherit;font-weight:600;cursor:pointer}
.cargar:hover:not(:disabled){border-color:var(--suave)}
.cargar:disabled{opacity:.6;cursor:wait}
.vacio{margin:16px 0;padding:16px;background:var(--sup2);border-radius:10px}
.vacio p{margin:0 0 8px}.vacio p:last-child{margin:0;color:var(--suave)}
.paginas{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 0;color:var(--suave);font-size:.9rem}
.pagina-enlace{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border:1px solid var(--borde);border-radius:10px;color:var(--texto);text-decoration:none;font-weight:600;background:var(--sup)}
.pagina-enlace:hover{border-color:var(--suave)}
@media print{body{background:#fff;color:#000}.volver,.acciones,.herramientas,.paginas{display:none}.msg{border-color:#bbb;break-inside:avoid}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

// Filtro local, sin red: por texto (incluye las transcripciones) y por tipo de mensaje.
const JS = String.raw`
(() => {
  const items = Array.from(document.querySelectorAll('#lista > li'));
  const entrada = document.getElementById('buscar');
  const resultado = document.getElementById('resultado');
  const sinAcentos = (t) => String(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const mensajes = items.filter((li) => !li.classList.contains('dia'));
  function aplicar() {
    const q = sinAcentos(entrada.value.trim());
    const tipo = (document.querySelector('input[name="tipo"]:checked') || {}).value || 'todo';
    let visibles = 0;
    mensajes.forEach((li) => {
      if (li._k === undefined) li._k = sinAcentos(li.textContent);
      li.hidden = !((tipo === 'todo' || li.dataset.tipo === tipo) && (q === '' || li._k.includes(q)));
      if (!li.hidden) visibles += 1;
    });
    // Un separador de día solo se ve si debajo de él queda algún mensaje.
    let hayDebajo = false;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].classList.contains('dia')) { items[i].hidden = !hayDebajo; hayDebajo = false; }
      else if (!items[i].hidden) hayDebajo = true;
    }
    const filtrando = q !== '' || tipo !== 'todo';
    resultado.textContent = !filtrando ? '' : visibles === 0 ? 'Ningún mensaje coincide en esta página.' : visibles + ' de ' + mensajes.length + ' mensajes en esta página.';
  }
  // "Cargar imagen / audio": lo pide a WhatsApp (de uno en uno) y lo pone en el lugar del aviso.
  document.addEventListener('click', async (e) => {
    const boton = e.target.closest('button.cargar');
    if (!boton) return;
    const caja = boton.closest('.sin-medio');
    const fila = boton.closest('li.msg');
    const motivo = caja.querySelector('span');
    boton.disabled = true;
    boton.textContent = 'Pidiéndolo a WhatsApp…';
    motivo.textContent = 'Puede tardar hasta un minuto.';
    try {
      const r = await fetch('/medios/recuperar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat: document.getElementById('lista').dataset.chat, id: fila.dataset.msg }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      let nodo;
      if (fila.dataset.tipo === 'imagen') {
        nodo = document.createElement('a');
        nodo.className = 'foto'; nodo.href = d.url; nodo.target = '_blank'; nodo.rel = 'noopener';
        const img = document.createElement('img');
        img.src = d.url; img.alt = 'Imagen recuperada'; img.loading = 'lazy';
        nodo.append(img);
      } else {
        nodo = document.createElement('audio');
        nodo.controls = true; nodo.preload = 'none';
        [['audio/ogg', d.url], ['audio/mp4', d.url + '.m4a']].forEach(([tipo, src]) => {
          const fuente = document.createElement('source');
          fuente.src = src; fuente.type = tipo;
          nodo.append(fuente);
        });
      }
      caja.replaceWith(nodo);
    } catch (err) {
      boton.disabled = false;
      boton.textContent = 'Reintentar';
      motivo.textContent = err.message;
    }
  });
  entrada.addEventListener('input', aplicar);
  document.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener('change', aplicar));
})();
`;

// Si se llegó desde un reporte que no puso su id en la dirección (los generados antes de este cambio),
// se recupera del referente: solo del mismo sitio y solo si la ruta es /reportes/<id>.
const JS_REFERENTE = String.raw`
(() => {
  if (document.querySelector('.boton-enlace[href^="/reportes/"]') || !document.referrer) return;
  let u;
  try { u = new URL(document.referrer); } catch (_) { return; }
  if (u.origin !== location.origin || !new RegExp('^/reportes/[a-z0-9-]+$').test(u.pathname)) return;
  const enlace = document.createElement('a');
  enlace.className = 'boton-enlace';
  enlace.href = u.pathname;
  enlace.textContent = 'Ver resumen';
  const contenedor = document.createElement('p');
  contenedor.className = 'acciones';
  contenedor.append(enlace);
  document.querySelector('.cabecera').append(contenedor);
})();
`;

const dos = (n) => String(n).padStart(2, '0');
const hora = (iso) => { const d = new Date(iso); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; };
const diaClave = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
const tono = (nombre) => [...String(nombre ?? '')].reduce((s, c) => s + c.charCodeAt(0), 0) % 5;

// Texto del mensaje: escapado primero; solo los enlaces http(s) se vuelven clicables.
function conEnlaces(texto) {
  return escaparHtml(texto).replace(/https?:\/\/[^\s<]+/g, (url) => {
    const cola = /[.,;:!?)]+$/.exec(url)?.[0] ?? '';
    const limpia = cola ? url.slice(0, -cola.length) : url;
    return `<a href="${limpia}" target="_blank" rel="noopener noreferrer">${limpia}</a>${cola}`;
  });
}

// Aviso de un archivo que no se puede mostrar: qué es y por qué.
function sinMedio(m, icono, que) {
  if (m.recuperable) {
    const [titulo, boton] = que === 'Imagen' ? ['Imagen no guardada', 'Cargar imagen'] : ['Audio no guardado', 'Cargar audio'];
    return `<div class="sin-medio recuperable">${icono}<p><strong>${titulo}</strong><span>Se puede pedir a WhatsApp.</span></p><button type="button" class="cargar boton secundario">${boton}</button></div>`;
  }
  const titulo = que === 'Imagen' ? 'Imagen no guardada' : 'Audio no guardado';
  const motivo = m.sinMedio ? 'No se puede pedir de nuevo a WhatsApp.' : 'No se guardó el archivo de este mensaje.';
  return `<div class="sin-medio">${icono}<p><strong>${titulo}</strong><span>${motivo}</span></p></div>`;
}

function cuerpoMedio(m) {
  const nombre = escaparHtml(m.nombre || 'un contacto');
  const parrafo = m.texto ? `<p class="texto">${conEnlaces(m.texto)}</p>` : '';
  if (m.tipo === 'imagen') {
    if (m.urlMedio) {
      const u = escaparHtml(m.urlMedio);
      return `<a class="foto" href="${u}" target="_blank" rel="noopener">\n<img src="${u}" alt="Imagen enviada por ${nombre}" loading="lazy">\n</a>${parrafo}`;
    }
    return `${sinMedio(m, ICONO_IMAGEN, 'Imagen')}${parrafo}`;
  }
  if (m.urlMedio) {
    const u = escaparHtml(m.urlMedio);
    const transcripcion = m.transcripcion ? `<p class="transcripcion"><strong>Transcripción</strong> ${escaparHtml(m.transcripcion)}</p>` : '';
    return `<audio controls preload="none">\n<source src="${u}" type="audio/ogg">\n<source src="${u}.m4a" type="audio/mp4">\n</audio>${transcripcion}`;
  }
  return sinMedio(m, ICONO_AUDIO, 'Audio');
}

function mensajeHtml(m) {
  const propio = m.propio === true;
  const autor = m.esGrupo && !propio
    ? `<span class="autor t${tono(m.nombre)}">${escaparHtml(m.nombre || 'Alguien del grupo')}</span>`
    : '';
  const cuerpo = m.tipo === 'imagen' || m.tipo === 'audio'
    ? cuerpoMedio(m)
    : `<p class="texto">${conEnlaces(m.texto ?? '')}</p>`;
  const tipo = m.tipo === 'imagen' || m.tipo === 'audio' ? m.tipo : 'texto';
  return `<li class="msg ${propio ? 'propio' : 'ajeno'}" data-tipo="${tipo}" data-msg="${escaparHtml(m.id ?? '')}">\n${autor}${cuerpo}\n<time datetime="${escaparHtml(m.fecha)}">${hora(m.fecha)}</time>\n</li>`;
}

function navegacion({ chat, desde, hasta, reporte, pagina, totalPaginas }) {
  if (totalPaginas <= 1) return '';
  const enlace = (n, texto) => {
    const q = new URLSearchParams({ chat, desde, hasta, ...(reporte ? { reporte } : {}), pagina: String(n) });
    return `<a class="pagina-enlace" href="${escaparHtml(`/conversacion?${q}`)}">${texto}</a>`;
  };
  return `<nav class="paginas" aria-label="Páginas de la conversación">
${pagina > 1 ? enlace(pagina - 1, 'Anterior') : '<span></span>'}
<span>Página ${pagina} de ${totalPaginas}</span>
${pagina < totalPaginas ? enlace(pagina + 1, 'Siguiente') : '<span></span>'}
</nav>`;
}

export function renderConversacion({ nombre, chat, desde, hasta, reporte, mensajes, total, pagina, totalPaginas, version, guardados }) {
  const titulo = escaparHtml(nombre || chat || 'Conversación');
  const cuenta = `${total} ${total === 1 ? 'mensaje' : 'mensajes'}`;
  let diaActual = null;
  const filas = [];
  for (const m of mensajes) {
    const clave = diaClave(m.fecha);
    if (clave !== diaActual) {
      diaActual = clave;
      filas.push(`<li class="dia">${escaparHtml(etiquetaDia(m.fecha))}</li>`);
    }
    filas.push(mensajeHtml(m));
  }
  const nav = navegacion({ chat, desde, hasta, reporte, pagina, totalPaginas });
  const acciones = reporte
    ? `<p class="acciones"><a class="boton-enlace" href="/reportes/${escaparHtml(reporte)}">${ICONO_CHAT}Ver resumen</a></p>`
    : '';
  const cuerpo = mensajes.length === 0
    ? `<div class="vacio"><p><strong>No hay mensajes guardados de este chat en ese periodo.</strong></p><p>${guardados ? `Este chat tiene mensajes guardados ${escaparHtml(etiquetaRango(guardados.primero, guardados.ultimo))}. Prueba con otro día.` : 'Todavía no hay ningún mensaje guardado de este chat.'}</p></div>`
    : `${nav}<ol class="mensajes" id="lista" data-chat="${escaparHtml(chat)}">\n${filas.join('\n')}\n</ol>\n${nav}`;
  const herramientas = mensajes.length === 0 ? '' : `<div class="herramientas">
<div class="busca">${ICONO_BUSCAR}<input type="search" id="buscar" placeholder="Buscar en esta página" aria-label="Buscar en los mensajes" autocomplete="off"></div>
<fieldset class="chips"><legend class="solo-lectores">Mostrar</legend>
<input type="radio" name="tipo" value="todo" id="t-todo" checked><label class="chip" for="t-todo">Todo</label>
<input type="radio" name="tipo" value="imagen" id="t-imagen"><label class="chip" for="t-imagen">Imágenes</label>
<input type="radio" name="tipo" value="audio" id="t-audio"><label class="chip" for="t-audio">Audios</label>
</fieldset>
<p id="resultado" aria-live="polite"></p>
</div>`;
  const irDia = guardados ? `<form id="ir-dia" method="get" action="/conversacion" class="ir-dia">
<input type="hidden" name="chat" value="${escaparHtml(chat)}">${reporte ? `<input type="hidden" name="reporte" value="${escaparHtml(reporte)}">` : ''}
<label for="dia">Ir a otro día</label>
<input type="date" name="dia" id="dia" required min="${escaparHtml(diaClave(guardados.primero))}" max="${escaparHtml(diaClave(guardados.ultimo))}">
<button type="submit" class="boton secundario">Ir</button>
</form>` : '';
  const pie = version ? `<footer class="pie">Resumen de WhatsApp v${escaparHtml(version)} · Desarrollado por JP</footer>` : '';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${titulo}</title>
<style>${BASE_CSS}${CSS}</style>
</head>
<body>
<div class="pagina">
<a class="volver" href="/">${FLECHA}Volver al panel</a>
<header class="cabecera">
<h1>${titulo}</h1>
<p class="meta">${escaparHtml(etiquetaPeriodo(desde, hasta))}</p>
<p class="meta">${cuenta}</p>
${acciones}
</header>
${irDia}
${herramientas}
<main>
${cuerpo}
</main>
${pie}
</div>
${mensajes.length === 0 ? '' : `<script>${JS}</script>`}
<script>${JS_REFERENTE}</script>
</body>
</html>
`;
}

function paginaError(estado, titulo, detalle) {
  return {
    estado,
    html: `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escaparHtml(titulo)}</title><style>${BASE_CSS}</style></head>
<body><div class="pagina"><a class="volver" href="/">${FLECHA}Volver al panel</a><h1>${escaparHtml(titulo)}</h1><p>${escaparHtml(detalle)}</p></div></body></html>
`,
  };
}

function limite(valor, esFin) {
  if (FECHA.test(valor)) return esFin ? finDelDia(valor) : inicioDelDia(valor);
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

// GET /conversacion?chat=<jid>&desde=<AAAA-MM-DD|ISO>&hasta=<...>&pagina=<n>
export function crearConversacion({ almacen, vigilados, nombrePara, nombres, version, dirReportes }) {
  return async function conversacion({ ruta }) {
    const q = new URL(String(ruta), 'http://local').searchParams;
    const chat = q.get('chat');
    if (!chat) return paginaError(400, 'Falta el chat', 'Abre la conversación desde el panel.');
    // Primero el rechazo: antes de leer un solo mensaje.
    if (!(await vigilados.esVigilado(chat))) return paginaError(403, 'Chat no vigilado', 'Solo se pueden ver los chats que vigilas.');
    // "Ir a otro día" manda un solo día; si no, el periodo del panel o de un reporte.
    const dia = q.get('dia');
    const desde = limite(dia ?? q.get('desde') ?? hoy(), false);
    const hasta = limite(dia ?? q.get('hasta') ?? hoy(), true);
    if (!desde || !hasta || desde > hasta) return paginaError(400, 'Fechas no válidas', 'Revisa el periodo e inténtalo de nuevo.');

    // Reporte de origen: solo si el id es válido y el archivo existe, para no mostrar un enlace roto.
    const idReporte = q.get('reporte');
    const reporte = dirReportes && idReporte && ID_REPORTE.test(idReporte)
      && (await access(join(dirReportes, `${idReporte}.html`)).then(() => true, () => false))
      ? idReporte : null;

    const delChat = await almacen.leer({ chat });
    const guardados = delChat.length > 0 ? { primero: delChat[0].fecha, ultimo: delChat[delChat.length - 1].fecha } : null;
    const d0 = Date.parse(desde);
    const h0 = Date.parse(hasta);
    const todos = delChat.filter((m) => { const t = Date.parse(m.fecha); return t >= d0 && t <= h0; });
    const totalPaginas = Math.max(1, Math.ceil(todos.length / POR_PAGINA));
    let pagina = Number.parseInt(q.get('pagina') ?? '1', 10);
    if (!Number.isInteger(pagina) || pagina < 1) pagina = 1;
    pagina = Math.min(pagina, totalPaginas);
    // Nombres reales en lugar de números internos; si Evolution no responde se muestra un rastro corto.
    const mapaNombres = await Promise.resolve(nombres?.()).catch(() => undefined);
    const mensajes = conNombres(todos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA), mapaNombres);

    for (const m of mensajes) {
      if ((m.tipo !== 'audio' && m.tipo !== 'imagen') || !ID_MEDIO.test(String(m.mediaId ?? ''))) continue;
      if (!(await almacen.localizarMedio({ mediaId: m.mediaId, mimetype: m.mimetype }))) {
        m.recuperable = Boolean(m.medio); // hay datos para pedirlo a WhatsApp
        continue;
      }
      m.urlMedio = `/medios/${encodeURIComponent(m.mediaId)}`;
      if (m.tipo === 'audio') m.transcripcion = await almacen.leerTranscripcion({ mediaId: m.mediaId, mimetype: m.mimetype });
    }
    const nombre = await Promise.resolve(nombrePara?.(chat)).catch(() => undefined);
    return {
      estado: 200,
      html: renderConversacion({ nombre, chat, desde, hasta, reporte, mensajes, total: todos.length, pagina, totalPaginas, version, guardados }),
    };
  };
}
