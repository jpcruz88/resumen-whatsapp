import { pathToFileURL } from 'node:url';
// Servidor HTTP: recibe webhooks de Evolution y sirve resúmenes.
// Solo lectura del chat: nunca envía mensajes a WhatsApp.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { parsearEventoEvolution, parsearHistorial } from './parse.js';
import { Almacen } from './almacen.js';
import { Vigilados } from './vigilados.js';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { crearPanel } from './panel.js';
import { crearClienteEvolution } from './evolution.js';
import { conCache } from './cache.js';
import pkg from '../package.json' with { type: 'json' };
import { crearConversacion } from './conversacion.js';
import { crearMedios } from './medios-http.js';
import { crearRecuperacion } from './recuperar.js';
import { buscarFfmpeg, convertirAM4a } from './audio.js';
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
      if (cuerpo?.event === 'messages.set') {
        // Historial al vincular: el de los chats vigilados se guarda completo; el resto va al buzón.
        const recibidos = parsearHistorial(cuerpo);
        const { nuevos, actualizados } = await almacen.guardarLoteDetallado(recibidos);
        if (recibidos.length > 0) console.log('historial importado:', nuevos, 'de', recibidos.length, `(${actualizados} completados con datos de descarga)`);
        return { estado: 200, cuerpo: { ok: true, guardados: nuevos, actualizados } };
      }
      const m = parsearEventoEvolution(cuerpo);
      // Todo (guardar, medio, descarga) va bajo el mismo chat vigilado, sea el directo o el alterno.
      // Lo de chats no vigilados no se descarta: va al buzón (solo texto y datos de descarga).
      const chat = m ? await almacen.resolverChat(m) : null;
      if (m && !chat) await almacen.guardarEnBuzon([m]);
      if (m) m.chat = chat;
      if (chat && (await almacen.guardar(m)) && (m.tipo === 'audio' || m.tipo === 'imagen')) {
        // Con webhook.base64 el medio viaja en el payload: no se descarga nada de Evolution.
        const embebido = m.base64 ? Buffer.from(m.base64, 'base64') : null;
        try {
          if (embebido && embebido.length > 0) {
            await almacen.guardarMedio({ chat: m.chat, mediaId: m.mediaId, mimetype: m.mimetype, buffer: embebido });
          } else if (evolution) {
            // Respaldo: sin base64 en el payload. El mimetype parseado manda (reportar lo usa para
            // leer); el de Evolution es el respaldo.
            const { buffer, mimetype } = await evolution.descargarMedia(m.mediaId, m.chat);
            await almacen.guardarMedio({ chat: m.chat, mediaId: m.mediaId, mimetype: m.mimetype || mimetype, buffer });
          }
        } catch {
          // No se registra el texto del error: puede contener URLs, claves o el contenido.
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
export function crearRouter({ webhook, panel, conversacion, medios, recuperar, dirReportes, hosts = [] }) {
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
    if (metodo === 'POST' && camino === '/medios/recuperar' && recuperar) return recuperar(peticion);
    if (metodo === 'GET' && camino === '/conversacion' && conversacion) return conversacion(peticion);
    if (metodo === 'GET' && camino.startsWith('/medios/') && medios) return medios({ ...peticion, ruta: camino });
    if (metodo === 'GET' && camino.startsWith('/reportes/')) {
      return servirReporte({ dirReportes, id: camino.slice('/reportes/'.length) });
    }
    return panel({ ...peticion, ruta: camino });
  };
}

// Tope del cuerpo de una petición: los webhooks traen medios en base64.
// El historial que manda WhatsApp al vincular llega en lotes de miles de mensajes (con miniaturas).
export const MAX_CUERPO = 256 * 1024 * 1024;

function responderJson(res, estado, objeto) {
  res.writeHead(estado, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(objeto));
}

// Imágenes y audios, con soporte de Range: Safari y el iPhone lo exigen para reproducir audio y adelantarlo.
// El tipo viene de una lista fija en medios-http.js y nosniff impide que el navegador lo reinterprete.
async function servirArchivo(req, res, { archivo }) {
  let info;
  try { info = await stat(archivo.ruta); } catch { return responderJson(res, 404, { error: 'no encontrado' }); }
  const total = info.size;
  const cabeceras = {
    'content-type': archivo.tipo,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'content-disposition': 'inline',
  };
  let inicio = 0;
  let fin = total - 1;
  let codigo = 200;
  if (req.headers.range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    let valido = Boolean(m) && (m[1] !== '' || m[2] !== '');
    if (valido && m[1] === '') {
      const ultimos = Number(m[2]);
      valido = ultimos > 0;
      inicio = Math.max(0, total - ultimos);
    } else if (valido) {
      inicio = Number(m[1]);
      fin = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
      valido = inicio < total && inicio <= fin;
    }
    if (!valido) {
      res.writeHead(416, { 'content-range': `bytes */${total}`, 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'rango no válido' }));
    }
    codigo = 206;
    cabeceras['content-range'] = `bytes ${inicio}-${fin}/${total}`;
  }
  cabeceras['content-length'] = String(Math.max(0, fin - inicio + 1));
  res.writeHead(codigo, cabeceras);
  if (total === 0) return res.end();
  createReadStream(archivo.ruta, { start: inicio, end: fin }).on('error', () => res.destroy()).pipe(res);
}

// Lee el cuerpo como Buffers y lo decodifica una sola vez. Devuelve null si excede el tope.
async function leerCuerpo(req, maxCuerpo) {
  const trozos = [];
  let total = 0;
  for await (const trozo of req) {
    total += trozo.length;
    if (total > maxCuerpo) return null;
    trozos.push(trozo);
  }
  return Buffer.concat(trozos).toString('utf8');
}

export function crearServidorHttp({ manejar, maxCuerpo = MAX_CUERPO }) {
  return createServer(async (req, res) => {
    const declarado = Number(req.headers['content-length']);
    if (Number.isFinite(declarado) && declarado > maxCuerpo) {
      res.setHeader('connection', 'close');
      responderJson(res, 413, { error: 'cuerpo demasiado grande' });
      return;
    }
    const cuerpo = await leerCuerpo(req, maxCuerpo);
    if (cuerpo === null) {
      res.setHeader('connection', 'close');
      responderJson(res, 413, { error: 'cuerpo demasiado grande' });
      res.on('finish', () => req.destroy());
      return;
    }
    let json;
    try {
      json = cuerpo ? JSON.parse(cuerpo) : undefined;
    } catch {
      return responderJson(res, 400, { error: 'JSON inválido' });
    }
    try {
      const r = await manejar({
        metodo: req.method,
        ruta: req.url,
        cabeceras: req.headers,
        cuerpo: json,
      });
      if (r.archivo) {
        await servirArchivo(req, res, r);
      } else if (r.html !== undefined) {
        res.writeHead(r.estado, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(r.html);
      } else {
        responderJson(res, r.estado, r.cuerpo);
      }
    } catch (err) {
      responderJson(res, 500, { error: err.message });
    }
  });
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
  // Listar contactos y grupos tarda ~10 s (Evolution consulta a WhatsApp): se guarda en memoria y se
  // renueva por detrás, para que el panel abra al instante.
  const listarChats = conCache(() => evolution.listarChats(), { ttlMs: 5 * 60 * 1000 });
  const ffmpeg = buscarFfmpeg();
  const convertir = ffmpeg ? (origen, destino) => convertirAM4a({ origen, destino, ffmpeg }) : null;
  const nombres = conCache(() => evolution.mapaNombres(), { ttlMs: 5 * 60 * 1000 });
  nombres.precalentar();
  const nombrePara = async (chat) => (await listarChats().catch(() => [])).find((c) => c.jid === chat)?.nombre;
  const manejar = crearRouter({
    webhook: crearManejador({ almacen, secreto: cfg.secreto, evolution }),
    conversacion: crearConversacion({ almacen, vigilados, nombrePara, nombres, version: pkg.version, dirReportes }),
    medios: crearMedios({ almacen, convertir }),
    recuperar: crearRecuperacion({ almacen, vigilados, evolution }),
    panel: crearPanel({
      vigilados,
      almacen,
      evolution: { listarChats },
      generar: ({ chat, nombre, desde, hasta }) =>
        generarReporte({ chat, nombre, desde, hasta, almacen, vigilados, medios, dirReportes, evolution, nombres }),
    }),
    dirReportes,
    hosts: [`127.0.0.1:${puerto}`, `localhost:${puerto}`, ...cfg.panelHosts],
  });

  const servidor = crearServidorHttp({ manejar });

  // El buzón de chats no vigilados guarda solo cfg.buzonDias días: se limpia al arrancar y cada día.
  const limpiar = () => almacen.limpiarBuzon({ dias: cfg.buzonDias }).then((r) => r.borrados > 0 && console.log('buzón: borrados', r.borrados, 'mensajes viejos'), () => {});
  limpiar();
  setInterval(limpiar, 24 * 3600 * 1000).unref();

  servidor.listen(puerto, '127.0.0.1', () => {
    console.log(`escuchando en 127.0.0.1:${puerto}`);
    listarChats.precalentar();
  });
  return servidor;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  arrancar().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
