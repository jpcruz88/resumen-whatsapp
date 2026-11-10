// Panel web: lista chats, marca vigilados y pide reportes.
// Se alcanza por el tunel de Cloudflare protegido con Access; no usa apikey.
import { escaparHtml } from './reporte.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function pagina(chats, vigilados) {
  const filas = chats
    .map((c) => {
      const jid = escaparHtml(c.jid);
      const nombre = escaparHtml(c.nombre || c.jid);
      const marcado = vigilados.includes(c.jid) ? ' checked' : '';
      return `<tr><td><input type="checkbox" data-chat="${jid}"${marcado}></td><td>${nombre}</td><td><code>${jid}</code></td></tr>`;
    })
    .join('\n');
  const opciones = chats
    .map((c) => `<option value="${escaparHtml(c.jid)}">${escaparHtml(c.nombre || c.jid)}</option>`)
    .join('\n');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resumen de WhatsApp</title>
</head>
<body>
<h1>Chats</h1>
<table>
<thead><tr><th>Vigilar</th><th>Chat</th><th>JID</th></tr></thead>
<tbody>
${filas}
</tbody>
</table>
<h2>Generar resumen</h2>
<form id="form-resumen">
<label>Chat <select name="chat">
${opciones}
</select></label>
<label>Desde <input type="date" name="desde" required></label>
<label>Hasta <input type="date" name="hasta" required></label>
<button type="submit">Generar resumen</button>
</form>
<p id="estado"></p>
<script>
document.querySelectorAll('input[data-chat]').forEach((el) => {
  el.addEventListener('change', async () => {
    await fetch('/vigilar', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: el.dataset.chat, activo: el.checked }) });
  });
});
document.getElementById('form-resumen').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const estado = document.getElementById('estado');
  estado.textContent = 'Generando...';
  const r = await fetch('/resumen', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat: f.get('chat'), desde: f.get('desde'), hasta: f.get('hasta') }) });
  const d = await r.json();
  if (r.ok) { estado.textContent = ''; const a = document.createElement('a'); a.href = d.url; a.textContent = 'Abrir reporte'; estado.append(a); }
  else estado.textContent = d.error || 'Error';
});
</script>
</body>
</html>
`;
}

export function crearPanel({ vigilados, evolution, generar }) {
  return async function manejar({ metodo, ruta, cuerpo }) {
    if (metodo === 'GET' && ruta === '/') {
      const chats = await evolution.listarChats();
      return { estado: 200, html: pagina(chats, await vigilados.lista()) };
    }

    if (metodo === 'POST' && ruta === '/vigilar') {
      const { chat, activo } = cuerpo ?? {};
      if (typeof chat !== 'string' || !chat) return { estado: 400, cuerpo: { error: 'chat requerido' } };
      if (activo) await vigilados.activar(chat);
      else await vigilados.desactivar(chat);
      return { estado: 200, cuerpo: { ok: true } };
    }

    if (metodo === 'POST' && ruta === '/resumen') {
      const { chat, desde, hasta } = cuerpo ?? {};
      if (typeof chat !== 'string' || !chat) return { estado: 400, cuerpo: { error: 'chat requerido' } };
      if (!FECHA.test(String(desde)) || !FECHA.test(String(hasta))) {
        return { estado: 400, cuerpo: { error: 'fechas AAAA-MM-DD requeridas' } };
      }
      if (!(await vigilados.esVigilado(chat))) return { estado: 403, cuerpo: { error: 'chat no vigilado' } };
      const { url } = await generar({ chat, desde, hasta });
      return { estado: 200, cuerpo: { url } };
    }

    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  };
}
