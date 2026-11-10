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
import { leerConfig } from './config.js';

function igual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function crearManejador({ almacen, secreto, evolution }) {
  return async function manejar({ metodo, ruta, cabeceras = {}, cuerpo }) {
    if (!igual(cabeceras.apikey, secreto)) return { estado: 401, cuerpo: { error: 'no autorizado' } };

    if (metodo === 'POST' && ruta === '/webhook/evolution') {
      const m = parsearEventoEvolution(cuerpo);
      if (m && (await almacen.guardar(m)) && evolution && (m.tipo === 'audio' || m.tipo === 'imagen')) {
        try {
          // El mimetype parseado manda (reportar lo usa para leer); el de Evolution es el respaldo.
          const { buffer, mimetype } = await evolution.descargarMedia(m.mediaId, m.chat);
          await almacen.guardarMedio({ chat: m.chat, mediaId: m.mediaId, mimetype: m.mimetype || mimetype, buffer });
        } catch {
          // No se registra el texto del error: puede contener URLs o claves.
          console.error('descarga de medio fallida', m.mediaId);
        }
      }
      return { estado: 200, cuerpo: { ok: true } };
    }

    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  };
}

// Sirve un reporte guardado. El id solo admite [a-z0-9-] (base36 + hash hex): sin traversal.
export async function servirReporte({ dirReportes, id }) {
  if (!/^[a-z0-9-]+$/.test(String(id ?? ''))) return { estado: 404, cuerpo: { error: 'no encontrado' } };
  try {
    return { estado: 200, html: await readFile(join(dirReportes, `${id}.html`), 'utf8') };
  } catch {
    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  }
}

// El webhook exige apikey; el panel y los reportes van por el tunel con Access.
// Defensa contra CSRF y DNS rebinding en las rutas del panel (no aplica al webhook).
export function crearRouter({ webhook, panel, dirReportes, hosts = [] }) {
  const permitidos = new Set(hosts.map((h) => h.toLowerCase()));
  return async function enrutar(peticion) {
    const { metodo, ruta, cabeceras = {} } = peticion;
    const camino = ruta.split('?')[0];
    if (camino === '/webhook/evolution') return webhook(peticion);
    if (!permitidos.has(String(cabeceras.host ?? '').toLowerCase())) {
      return { estado: 403, cuerpo: { error: 'host no permitido' } };
    }
    if (metodo === 'POST' && !String(cabeceras['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      return { estado: 415, cuerpo: { error: 'se requiere application/json' } };
    }
    if (metodo === 'GET' && camino.startsWith('/reportes/')) {
      return servirReporte({ dirReportes, id: camino.slice('/reportes/'.length) });
    }
    return panel({ ...peticion, ruta: camino });
  };
}

// Arranque real: lee configuración del entorno y escucha en el puerto indicado.
export async function arrancar(env = process.env) {
  const cfg = leerConfig(env);
  const dir = cfg.datosDir;
  const puerto = cfg.puerto;
  const vigilados = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  const almacen = new Almacen({ dir, vigilados });
  const dirReportes = join(dir, 'reportes');
  const medios = { apiKey: cfg.geminiKey, model: cfg.geminiModel };
  const evolution = crearClienteEvolution(cfg.evolution);
  const manejar = crearRouter({
    webhook: crearManejador({ almacen, secreto: cfg.secreto, evolution }),
    panel: crearPanel({
      vigilados,
      evolution,
      generar: ({ chat, desde, hasta }) =>
        generarReporte({ chat, desde, hasta, almacen, vigilados, medios, dirReportes, evolution }),
    }),
    dirReportes,
    hosts: [`127.0.0.1:${puerto}`, `localhost:${puerto}`, ...cfg.panelHosts],
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

  servidor.listen(puerto, '127.0.0.1', () => console.log(`escuchando en 127.0.0.1:${puerto}`));
  return servidor;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  arrancar().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
