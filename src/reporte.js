import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { etiquetaPeriodo } from './fechas.js';
import { BASE_CSS, FLECHA as FLECHA_VOLVER, ICONO_CHAT } from './estilos.js';

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

// Escapa primero y despues convierte; el markdown nunca introduce texto sin escapar.
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// "[2026-11-09 09:12]" (la cita que el resumen pone en cada tarea) pasa a ser una etiqueta legible.
// Una fecha imposible se deja tal cual.
function conCitas(texto) {
  return texto.replace(/\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})\]/g, (entero, a, m, d, h, min) => {
    const mes = Number(m); const dia = Number(d);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || Number(h) > 23 || Number(min) > 59) return entero;
    return `<time class="cita" datetime="${a}-${m}-${d}T${h}:${min}">${dia} ${MES_CORTO[mes - 1]}, ${h}:${min}</time>`;
  });
}

export function markdownAHtml(md) {
  const salida = [];
  let lista = false;
  let parrafo = [];
  const cerrarLista = () => { if (lista) { salida.push('</ul>'); lista = false; } };
  const cerrarParrafo = () => {
    if (parrafo.length) { salida.push(`<p>${conCitas(parrafo.join(' '))}</p>`); parrafo = []; }
  };
  for (const cruda of escaparHtml(md).split(/\r?\n/)) {
    const linea = cruda.trim();
    let m;
    if (!linea) { cerrarLista(); cerrarParrafo(); }
    else if ((m = linea.match(/^###\s+(.*)$/))) { cerrarLista(); cerrarParrafo(); salida.push(`<h3>${m[1]}</h3>`); }
    else if ((m = linea.match(/^##\s+(.*)$/))) { cerrarLista(); cerrarParrafo(); salida.push(`<h2>${m[1]}</h2>`); }
    else if ((m = linea.match(/^[-*]\s+(.*)$/))) {
      cerrarParrafo();
      if (!lista) { salida.push('<ul>'); lista = true; }
      salida.push(`<li>${conCitas(m[1])}</li>`);
    } else { cerrarLista(); parrafo.push(linea); }
  }
  cerrarLista();
  cerrarParrafo();
  return salida.join('');
}

const CSS = BASE_CSS + `
header{margin:4px 0 0}
h1{margin:4px 0 6px;font-size:1.6rem;line-height:1.2;letter-spacing:-.01em;overflow-wrap:anywhere}
.meta{margin:0;color:var(--suave);font-size:.95rem}
.contenido{margin-top:20px;padding:8px 20px 20px;background:var(--sup);border:1px solid var(--borde);border-radius:12px}
h2{margin:24px 0 8px;padding-top:16px;border-top:1px solid var(--borde);font-size:1.25rem;line-height:1.3}
.contenido>h2:first-child{margin-top:12px;padding-top:0;border-top:0}
h3{margin:18px 0 6px;font-size:1.05rem}
ul{margin:6px 0;padding-left:1.25rem}
li{margin:8px 0}
p{margin:10px 0}
.cita{display:inline-block;padding:0 7px;border-radius:6px;background:var(--acento-suave);font-size:.85em;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.contenido.sin-tarjeta{padding:0;background:none;border:0}
.vacio{margin:16px 0 8px;padding:16px;background:var(--sup2);border-radius:10px}
.vacio p{margin:0 0 8px}
.vacio p:last-child{margin:0;color:var(--suave)}
@media print{body{background:#fff;color:#000}.volver,.acciones{display:none}.contenido{border:0;padding:0}.pie{color:#444}}`;


// mensajes: cuántos mensajes se resumieron. Con 0 no hay resumen y se explica por qué.
export function renderReporte({ chat, nombre, desde, hasta, markdown, mensajes, guardados, version, enlaceConversacion }) {
  const titulo = escaparHtml(nombre || chat || 'Resumen');
  const periodo = escaparHtml(etiquetaPeriodo(desde, hasta));
  const cuenta = Number.isInteger(mensajes) ? `${mensajes} ${mensajes === 1 ? 'mensaje' : 'mensajes'}` : '';
  const vacio = mensajes === 0;
  const desdeVigilar = guardados?.primero && guardados?.ultimo
    ? `Este chat tiene mensajes guardados del ${escaparHtml(etiquetaPeriodo(guardados.primero, guardados.ultimo))}. Prueba con otro periodo.`
    : 'Todavía no hay ningún mensaje guardado de este chat. Los que lleguen se guardan solos.';
  const cuerpo = vacio
    ? `<div class="vacio"><p><strong>No hay mensajes guardados de este chat en ese periodo.</strong></p><p>${desdeVigilar}</p></div>`
    : markdownAHtml(markdown);
  const acciones = enlaceConversacion
    ? `<p class="acciones"><a class="boton-enlace" href="${escaparHtml(enlaceConversacion)}">${ICONO_CHAT}Ver conversación</a></p>`
    : '';
  const pie = version ? `<footer class="pie">Resumen de WhatsApp v${escaparHtml(version)} · Desarrollado por JP</footer>` : '';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${titulo}</title>
<style>${CSS}</style>
</head>
<body>
<div class="pagina">
<a class="volver" href="/">${FLECHA_VOLVER}Volver al panel</a>
<header>
<h1>${titulo}</h1>
<p class="meta">${periodo}</p>
${cuenta ? `<p class="meta">${cuenta}</p>` : ''}
${acciones}
</header>
<main class="contenido${vacio ? ' sin-tarjeta' : ''}">
${cuerpo}
</main>
${pie}
</div>
</body>
</html>
`;
}

// Id de un reporte: solo minúsculas, números y guiones (es lo que acepta la ruta /reportes/:id).
export const ID_REPORTE = /^[a-z0-9-]{3,60}$/;

// Se pide antes de escribir el reporte para poder enlazarlo desde su propia conversación.
export function nuevoIdReporte() {
  return `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
}

export async function guardarReporte({ dir, html, id: idDado }) {
  if (idDado !== undefined && !ID_REPORTE.test(String(idDado))) throw new Error('id de reporte no válido');
  const ts = Date.now();
  const hash = createHash('sha256').update(html).update(String(ts)).digest('hex').slice(0, 10);
  const id = idDado ?? `${ts.toString(36)}-${hash}`;
  await mkdir(dir, { recursive: true });
  try {
    // Con un id dado, 'wx' evita pisar un reporte que ya existe.
    await writeFile(join(dir, `${id}.html`), html, { encoding: 'utf8', flag: idDado === undefined ? 'w' : 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error('ya existe un reporte con ese id');
    throw e;
  }
  return id;
}
