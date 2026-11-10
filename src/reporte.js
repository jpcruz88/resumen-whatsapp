import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { etiquetaPeriodo, fechaHoraLarga } from './fechas.js';

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

// Escapa primero y despues convierte; el markdown nunca introduce texto sin escapar.
export function markdownAHtml(md) {
  const salida = [];
  let lista = false;
  let parrafo = [];
  const cerrarLista = () => { if (lista) { salida.push('</ul>'); lista = false; } };
  const cerrarParrafo = () => {
    if (parrafo.length) { salida.push(`<p>${parrafo.join(' ')}</p>`); parrafo = []; }
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
      salida.push(`<li>${m[1]}</li>`);
    } else { cerrarLista(); parrafo.push(linea); }
  }
  cerrarLista();
  cerrarParrafo();
  return salida.join('');
}

const CSS = `
:root{color-scheme:light dark;--bg:#f3f6f5;--sup:#fff;--sup2:#eaf0ee;--texto:#142420;--suave:#51615c;--borde:#d3ddd9;--acento:#0b6e63;--acento-suave:#d9efea}
@media (prefers-color-scheme:dark){:root{--bg:#0d1311;--sup:#151d1a;--sup2:#1d2824;--texto:#e8f0ed;--suave:#9db0a9;--borde:#2b3a35;--acento:#3ccbb6;--acento-suave:#143a34}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--texto);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
::selection{background:var(--acento-suave);color:var(--texto)}
:focus-visible{outline:2px solid var(--acento);outline-offset:2px}
.pagina{max-width:44rem;margin:0 auto;padding:12px 16px 40px}
.volver{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:var(--suave);text-decoration:none;font-weight:600;font-size:.95rem}
.volver:hover{color:var(--texto)}
.volver svg{width:18px;height:18px}
h1{margin:4px 0 6px;font-size:1.6rem;line-height:1.2;letter-spacing:-.01em;overflow-wrap:anywhere}
.meta{margin:0;color:var(--suave);font-size:.95rem}
.contenido{margin-top:20px;padding:8px 20px 20px;background:var(--sup);border:1px solid var(--borde);border-radius:12px}
h2{margin:24px 0 8px;padding-top:16px;border-top:1px solid var(--borde);font-size:1.25rem;line-height:1.3}
.contenido>h2:first-child{margin-top:12px;padding-top:0;border-top:0}
h3{margin:18px 0 6px;font-size:1.05rem}
ul{margin:6px 0;padding-left:1.25rem}
li{margin:8px 0}
p{margin:10px 0}
.contenido.sin-tarjeta{padding:0;background:none;border:0}
.vacio{margin:16px 0 8px;padding:16px;background:var(--sup2);border-radius:10px}
.vacio p{margin:0 0 8px}
.vacio p:last-child{margin:0;color:var(--suave)}
.pie{margin-top:24px;color:var(--suave);font-size:.85rem}
@media print{body{background:#fff;color:#000}.volver{display:none}.contenido{border:0;padding:0}.pie{color:#444}}`;

const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';

// mensajes: cuántos mensajes se resumieron. Con 0 no hay resumen y se explica por qué.
export function renderReporte({ chat, nombre, desde, hasta, markdown, mensajes, vigiladoDesde, version }) {
  const titulo = escaparHtml(nombre || chat || 'Resumen');
  const periodo = escaparHtml(etiquetaPeriodo(desde, hasta));
  const cuenta = Number.isInteger(mensajes) ? `${mensajes} ${mensajes === 1 ? 'mensaje' : 'mensajes'}` : '';
  const vacio = mensajes === 0;
  const desdeVigilar = vigiladoDesde
    ? `Se empezó a vigilar el ${escaparHtml(fechaHoraLarga(vigiladoDesde))}. Solo se guardan los mensajes que llegan desde entonces.`
    : 'Solo se guardan los mensajes que llegan después de empezar a vigilar el chat.';
  const cuerpo = vacio
    ? `<div class="vacio"><p><strong>No hay mensajes guardados de este chat en ese periodo.</strong></p><p>${desdeVigilar}</p></div>`
    : markdownAHtml(markdown);
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
<a class="volver" href="/">${FLECHA}Volver al panel</a>
<header>
<h1>${titulo}</h1>
<p class="meta">${periodo}</p>
${cuenta ? `<p class="meta">${cuenta}</p>` : ''}
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

export async function guardarReporte({ dir, html }) {
  const ts = Date.now();
  const hash = createHash('sha256').update(html).update(String(ts)).digest('hex').slice(0, 10);
  const id = `${ts.toString(36)}-${hash}`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.html`), html, 'utf8');
  return id;
}
