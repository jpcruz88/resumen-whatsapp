// Rutas del panel web: lista chats, marca vigilados y pide reportes. La página vive en panel-pagina.js.
// Se alcanza por el tunel de Cloudflare protegido con Access; no usa apikey.
import { pagina } from './panel-pagina.js';
import { inicioDelDia, finDelDia } from './fechas.js';
import pkg from '../package.json' with { type: 'json' };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function crearPanel({ vigilados, evolution, generar }) {
  return async function manejar({ metodo, ruta, cuerpo }) {
    if (metodo === 'GET' && ruta === '/') {
      const chats = await evolution.listarChats();
      return { estado: 200, html: pagina(chats, await vigilados.lista(), pkg.version) };
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
      const { url } = await generar({ chat, desde: inicioDelDia(desde), hasta: finDelDia(hasta) });
      return { estado: 200, cuerpo: { url } };
    }

    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  };
}
