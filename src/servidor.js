import { pathToFileURL } from 'node:url';
// Servidor HTTP: recibe webhooks de Evolution y sirve resúmenes.
// Solo lectura del chat: nunca envía mensajes a WhatsApp.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { parsearEventoEvolution } from './parse.js';
import { resumir } from './resumen.js';
import { Almacen } from './almacen.js';

function igual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function crearManejador({ almacen, secreto, resumirFn }) {
  return async function manejar({ metodo, ruta, cabeceras = {}, cuerpo }) {
    if (!igual(cabeceras.apikey, secreto)) return { estado: 401, cuerpo: { error: 'no autorizado' } };

    if (metodo === 'POST' && ruta === '/webhook/evolution') {
      const m = parsearEventoEvolution(cuerpo);
      if (m) await almacen.guardar(m);
      return { estado: 200, cuerpo: { ok: true } };
    }

    if (metodo === 'GET' && ruta.startsWith('/resumen')) {
      const q = new URL(ruta, 'http://local').searchParams;
      const chat = q.get('chat');
      const mensajes = await almacen.leer({ chat, desde: q.get('desde'), hasta: q.get('hasta') });
      const texto = await resumirFn({ mensajes });
      return { estado: 200, cuerpo: { texto, mensajes: mensajes.length } };
    }

    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  };
}

// Arranque real: lee configuración del entorno y escucha en el puerto indicado.
export function arrancar(env = process.env) {
  const chats = (env.CHATS_PERMITIDOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (chats.length === 0) throw new Error('Define CHATS_PERMITIDOS (JIDs separados por coma)');
  if (!env.SECRETO_WEBHOOK) throw new Error('Define SECRETO_WEBHOOK');
  if (!env.GEMINI_API_KEY) throw new Error('Define GEMINI_API_KEY');

  const almacen = new Almacen({ dir: env.DATOS_DIR ?? './datos', chatsPermitidos: chats });
  const manejar = crearManejador({
    almacen,
    secreto: env.SECRETO_WEBHOOK,
    resumirFn: ({ mensajes }) => resumir({ mensajes, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }),
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
      res.writeHead(r.estado, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.cuerpo));
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
