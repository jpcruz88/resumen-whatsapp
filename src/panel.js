// Rutas del panel web: lista chats, marca vigilados y pide reportes. La página vive en panel-pagina.js.
// Se alcanza por el tunel de Cloudflare protegido con Access; no usa apikey.
import { pagina } from './panel-pagina.js';
import { inicioDelDia, finDelDia } from './fechas.js';
import pkg from '../package.json' with { type: 'json' };

const AVISO_DESCONECTADO = 'WhatsApp está desconectado: no se puede cargar la lista de contactos. Los chats vigilados y sus reportes siguen disponibles.';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function crearPanel({ vigilados, evolution, generar }) {
  return async function manejar({ metodo, ruta, cuerpo }) {
    if (metodo === 'GET' && ruta === '/') {
      const lista = await vigilados.lista();
      try {
        return { estado: 200, html: pagina(await evolution.listarChats(), lista, pkg.version) };
      } catch {
        // Evolution parado o WhatsApp desvinculado: el panel abre con los chats ya vigilados, sin la lista de contactos.
        const guardados = lista.map((jid) => ({ jid }));
        return { estado: 200, html: pagina(guardados, lista, pkg.version, AVISO_DESCONECTADO) };
      }
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
      // El nombre sale de la lista en memoria; si Evolution no responde, el reporte sigue sin nombre.
      const nombre = (await evolution.listarChats().catch(() => [])).find((c) => c.jid === chat)?.nombre;
      const { url } = await generar({ chat, nombre, desde: inicioDelDia(desde), hasta: finDelDia(hasta) });
      return { estado: 200, cuerpo: { url } };
    }

    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  };
}
