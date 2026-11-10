import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
:root{color-scheme:light dark;--fondo:#fff;--texto:#1a1a1a;--suave:#555}
@media (prefers-color-scheme:dark){:root{--fondo:#121212;--texto:#eaeaea;--suave:#aaa}}
body{background:var(--fondo);color:var(--texto);font:16px/1.5 system-ui,sans-serif;max-width:48rem;margin:0 auto;padding:1rem}
h1{font-size:1.4rem}h2{margin-top:2rem}h3{margin-top:1.5rem}
.meta{color:var(--suave);font-size:.9rem}
li{margin:.25rem 0}`;

export function renderReporte({ chat, nombre, desde, hasta, markdown }) {
  const titulo = escaparHtml(nombre || chat || 'Resumen');
  const meta = [chat, `${desde ?? ''} a ${hasta ?? ''}`].map(escaparHtml).join(' | ');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>${CSS}</style>
</head>
<body>
<h1>${titulo}</h1>
<p class="meta">${meta}</p>
${markdownAHtml(markdown)}
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
