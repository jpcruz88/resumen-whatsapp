import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { etiquetaPeriodo, etiquetaRango } from './fechas.js';
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

// Negritas (**así**) y cursivas (*así*) del resumen, más las citas de fecha. El texto ya viene escapado.
function enLinea(texto) {
  return conCitas(texto)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<em>$2</em>');
}

// Resumen estructurado { tareas, temas, personal }: las tareas en una tabla y los temas en dos columnas.
export function resumenAHtml({ tareas, temas, personal }) {
  const fila = (t) => `<tr>
<td data-etiqueta="Tarea">${escaparHtml(t.tarea)}</td>
<td data-etiqueta="Pidió">${escaparHtml(t.quien) || '—'}</td>
<td data-etiqueta="Cuándo">${t.cuando ? conCitas(escaparHtml(t.cuando)) : '—'}</td>
</tr>`;
  const bloqueTareas = tareas.length === 0
    ? '<p class="ninguna">Ninguna tarea en este periodo.</p>'
    : `<table class="tareas">
<thead><tr><th scope="col">Tarea</th><th scope="col">Pidió</th><th scope="col">Cuándo</th></tr></thead>
<tbody>
${tareas.map(fila).join('\n')}
</tbody>
</table>`;
  const lista = (items, vacio) => (items.length === 0
    ? `<p class="ninguna">${vacio}</p>`
    : `<ul class="temas">${items.map((x) => `<li>${x.titulo ? `<strong>${escaparHtml(x.titulo)}</strong>` : ''}${x.detalle ? `<p>${enLinea(escaparHtml(x.detalle))}</p>` : ''}</li>`).join('')}</ul>`);
  return `<section class="bloque-tareas"><h2>Tareas que me pidieron <span class="cuenta">${tareas.length}</span></h2>
${bloqueTareas}</section>
<div class="columnas">
<section class="columna"><h2>Temas de trabajo <span class="cuenta">${temas.length}</span></h2>${lista(temas, 'Sin temas de trabajo.')}</section>
<section class="columna"><h2>Personal <span class="cuenta">${personal.length}</span></h2>${lista(personal, 'Nada personal.')}</section>
</div>`;
}

export function markdownAHtml(md) {
  const salida = [];
  let lista = false;
  let parrafo = [];
  const cerrarLista = () => { if (lista) { salida.push('</ul>'); lista = false; } };
  const cerrarParrafo = () => {
    if (parrafo.length) { salida.push(`<p>${enLinea(parrafo.join(' '))}</p>`); parrafo = []; }
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
      salida.push(`<li>${enLinea(m[1])}</li>`);
    } else { cerrarLista(); parrafo.push(linea); }
  }
  cerrarLista();
  cerrarParrafo();
  return salida.join('');
}

const CSS = BASE_CSS + `
.pagina.ancha{max-width:68rem}
header{margin:4px 0 0}
h1{margin:4px 0 6px;font-size:1.6rem;line-height:1.2;letter-spacing:-.01em;overflow-wrap:anywhere}
.meta{margin:0;color:var(--suave);font-size:.95rem}
.contenido{margin-top:20px;padding:8px 20px 20px;background:var(--sup);border:1px solid var(--borde);border-radius:12px}
h2{margin:24px 0 8px;padding-top:16px;border-top:1px solid var(--borde);font-size:1.25rem;line-height:1.3}
.contenido>h2:first-child{margin-top:12px;padding-top:0;border-top:0}
h3{margin:18px 0 6px;font-size:1.05rem}
ul{margin:6px 0;padding-left:1.25rem}
li{margin:8px 0;line-height:1.5}
strong{font-weight:650}
p{margin:10px 0}
.cita{display:inline-block;padding:0 7px;border-radius:6px;background:var(--acento-suave);font-size:.85em;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.contenido.sin-tarjeta{padding:0;background:none;border:0}
.vacio{margin:16px 0 8px;padding:16px;background:var(--sup2);border-radius:10px}
.vacio p{margin:0 0 8px}
.vacio p:last-child{margin:0;color:var(--suave)}
.cuenta{margin-left:6px;color:var(--suave);font-size:.9rem;font-weight:500;font-variant-numeric:tabular-nums}
.bloque-tareas>h2{margin-top:12px;padding-top:0;border-top:0}
table.tareas{width:100%;border-collapse:collapse;margin:4px 0 8px}
table.tareas th{padding:8px 12px 8px 0;text-align:left;font-size:.85rem;font-weight:600;color:var(--suave);border-bottom:1px solid var(--borde)}
table.tareas td{padding:12px 12px 12px 0;vertical-align:top;border-bottom:1px solid var(--borde);overflow-wrap:anywhere}
table.tareas tr:last-child td{border-bottom:0}
table.tareas td[data-etiqueta="Tarea"]{width:56%;font-weight:600}
table.tareas td[data-etiqueta="Cuándo"]{white-space:nowrap}
.ninguna{margin:6px 0 4px;color:var(--suave)}
.columnas{display:grid;grid-template-columns:1fr;gap:0 40px}
.columna>h2{margin-top:24px}
ul.temas{list-style:none;margin:6px 0;padding:0}
ul.temas li{margin:0;padding:12px 0;border-bottom:1px solid var(--borde)}
ul.temas li:last-child{border-bottom:0}
ul.temas p{margin:2px 0 0;color:var(--suave)}
@media(min-width:800px){.columnas{grid-template-columns:1fr 1fr}.columna>h2{padding-top:16px}}
@media(max-width:640px){
table.tareas thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
table.tareas,table.tareas tbody,table.tareas tr,table.tareas td{display:block;width:auto}
table.tareas tr{padding:12px 0;border-bottom:1px solid var(--borde)}
table.tareas tr:last-child{border-bottom:0}
table.tareas td{padding:0;border:0}
table.tareas td[data-etiqueta="Tarea"]{width:auto;margin-bottom:4px}
table.tareas td[data-etiqueta="Pidió"],table.tareas td[data-etiqueta="Cuándo"]{display:inline;color:var(--suave);font-size:.9rem}
table.tareas td[data-etiqueta="Pidió"]::before{content:"Pidió: "}
table.tareas td[data-etiqueta="Pidió"]::after{content:" · "}
}
@media print{body{background:#fff;color:#000}.volver,.acciones{display:none}.contenido{border:0;padding:0}.pie{color:#444}}`;


// mensajes: cuántos mensajes se resumieron. Con 0 no hay resumen y se explica por qué.
export function renderReporte({ chat, nombre, desde, hasta, markdown, resumen, mensajes, guardados, version, enlaceConversacion }) {
  const titulo = escaparHtml(nombre || chat || 'Resumen');
  const periodo = escaparHtml(etiquetaPeriodo(desde, hasta));
  const resumenCuenta = resumen ? ` · ${resumen.tareas.length} ${resumen.tareas.length === 1 ? 'tarea' : 'tareas'} · ${resumen.temas.length} ${resumen.temas.length === 1 ? 'tema' : 'temas'} · ${resumen.personal.length} personal` : '';
  const cuenta = Number.isInteger(mensajes) ? `${mensajes} ${mensajes === 1 ? 'mensaje' : 'mensajes'}${mensajes > 0 ? resumenCuenta : ''}` : '';
  const vacio = mensajes === 0;
  const desdeVigilar = guardados?.primero && guardados?.ultimo
    ? `Este chat tiene mensajes guardados ${escaparHtml(etiquetaRango(guardados.primero, guardados.ultimo))}. Prueba con otro periodo.`
    : 'Todavía no hay ningún mensaje guardado de este chat. Los que lleguen se guardan solos.';
  const cuerpo = vacio
    ? `<div class="vacio"><p><strong>No hay mensajes guardados de este chat en ese periodo.</strong></p><p>${desdeVigilar}</p></div>`
    : resumen ? resumenAHtml(resumen) : markdownAHtml(markdown);
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
<div class="pagina${resumen && !vacio ? ' ancha' : ''}">
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
