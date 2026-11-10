import { pathToFileURL } from 'node:url';
// Servidor HTTP: recibe webhooks de Evolution y sirve resúmenes.
// Solo lectura del chat: nunca envía mensajes a WhatsApp.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { parsearEventoEvolution } from './parse.js';
import { Almacen } from './almacen.js';
import { Vigilados } from './vigilados.js';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { crearPanel } from './panel.js';
import { crearClienteEvolution } from './evolution.js';
import { generarReporte } from './reportar.js';

function igual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function crearManejador({ almacen, secreto }) {
  return async function manejar({ metodo, ruta, cabeceras = {}, cuerpo }) {
    if (!igual(cabeceras.apikey, secreto)) return { estado: 401, cuerpo: { error: 'no autorizado' } };

    if (metodo === 'POST' && ruta === '/webhook/evolution') {
      const m = parsearEventoEvolution(cuerpo);
      if (m) await almacen.guardar(m);
      return { estado: 200, cuerpo: { ok: true } };
    }

    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  };
}

// Sirve un reporte guardado. El id solo admite hex y guiones: sin traversal.
export async function servirReporte({ dirReportes, id }) {
  if (!/^[a-f0-9-]+$/.test(String(id ?? ''))) return { estado: 404, cuerpo: { error: 'no encontrado' } };
  try {
    return { estado: 200, html: await readFile(join(dirReportes, `${id}.html`), 'utf8') };
  } catch {
    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  }
}

// El webhook exige apikey; el panel y los reportes van por el tunel con Access.
export function crearRouter({ webhook, panel, dirReportes }) {
  return async function enrutar(peticion) {
    const { metodo, ruta } = peticion;
    const camino = ruta.split('?')[0];
    if (camino === '/webhook/evolution') return webhook(peticion);
    if (metodo === 'GET' && camino.startsWith('/reportes/')) {
      return servirReporte({ dirReportes, id: camino.slice('/reportes/'.length) });
    }
    return panel({ ...peticion, ruta: camino });
  };
}

// Arranque real: lee configuración del entorno y escucha en el puerto indicado.
export async function arrancar(env = process.env) {
  const chats = (env.CHATS_PERMITIDOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (chats.length === 0) throw new Error('Define CHATS_PERMITIDOS (JIDs separados por coma)');
  if (!env.SECRETO_WEBHOOK) throw new Error('Define SECRETO_WEBHOOK');
  if (!env.GEMINI_API_KEY) throw new Error('Define GEMINI_API_KEY');

  const dir = env.DATOS_DIR ?? './datos';
  const vigilados = new Vigilados({ archivo: env.VIGILADOS_ARCHIVO ?? join(dir, 'vigilados.json') });
  for (const c of chats) await vigilados.activar(c);
  const almacen = new Almacen({ dir, vigilados });
  const dirReportes = env.REPORTES_DIR ?? join(dir, 'reportes');
  const medios = { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  const evolution = crearClienteEvolution({
    url: env.EVOLUTION_URL,
    apiKey: env.EVOLUTION_API_KEY,
    instancia: env.EVOLUTION_INSTANCIA,
  });
  const manejar = crearRouter({
    webhook: crearManejador({ almacen, secreto: env.SECRETO_WEBHOOK }),
    panel: crearPanel({
      vigilados,
      evolution,
      generar: ({ chat, desde, hasta }) =>
        generarReporte({ chat, desde, hasta, almacen, vigilados, medios, dirReportes }),
    }),
    dirReportes,
  });

  const servidor = createServer(async (req, res) => {
    let cuerpo = '';
    for await (const trozo of req) cuerpo += trozo;
    let json;
    try {
      json = cuerpo ? JSON.parse(cuerpo) : undefined;
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'JSON inválido' }));
    }
    try {
      const r = await manejar({
        metodo: req.method,
        ruta: req.url,
        cabeceras: req.headers,
        cuerpo: json,
      });
      if (r.html !== undefined) {
        res.writeHead(r.estado, { 'content-type': 'text/html; charset=utf-8' });
        res.end(r.html);
      } else {
        res.writeHead(r.estado, { 'content-type': 'application/json' });
        res.end(JSON.stringify(r.cuerpo));
      }
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  const puerto = Number(env.PUERTO ?? 3100);
  servidor.listen(puerto, '127.0.0.1', () => console.log(`escuchando en 127.0.0.1:${puerto}`));
  return servidor;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) arrancar();
