// Rutas del panel web: la lista de chats guardados, la página de cada chat y el pedido de resúmenes.
// Se alcanza por el tunel de Cloudflare protegido con Access; no usa apikey. Las páginas viven en panel-pagina.js.
import { pagina, paginaChat, paginaVideo } from './panel-pagina.js';
import { urlValida } from './video.js';
import { inicioDelDia, finDelDia, diaLocal } from './fechas.js';
import { escaparHtml } from './reporte.js';
import pkg from '../package.json' with { type: 'json' };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const AVISO_DESCONECTADO = 'WhatsApp está desconectado: no se puede cargar la lista de contactos. Los chats guardados y sus reportes siguen disponibles.';
const SOLO_NUMERO = /^\d{6,}$/;
const esNombre = (n) => typeof n === 'string' && n.trim() !== '' && !SOLO_NUMERO.test(n.trim());

export function crearPanel({ almacen, evolution, nombres, generar, video, ahora = () => new Date() }) {
  let videoEnCurso = false;
  // jid -> nombre, de los contactos y grupos de Evolution y del mapa de nombres. Si Evolution no responde, ok=false.
  async function leerNombres() {
    const mapa = new Map();
    let ok = true;
    try {
      for (const c of await evolution.listarChats()) if (esNombre(c.nombre)) mapa.set(c.jid, c.nombre);
    } catch {
      ok = false;
    }
    if (nombres) {
      try {
        for (const [jid, n] of await nombres()) if (esNombre(n) && !mapa.has(jid)) mapa.set(jid, n);
      } catch { /* los nombres son un extra */ }
    }
    return { mapa, ok };
  }

  async function nombreDe(c, mapa) {
    for (const forma of await almacen.formas(c.chat)) if (mapa.has(forma)) return mapa.get(forma);
    if (c.esGrupo) return 'Grupo sin nombre';
    const id = c.chat.split('@')[0];
    return `Contacto sin nombre (…${id.slice(-4)})`;
  }

  const numeroDe = (c) => (c.chat.endsWith('@s.whatsapp.net') ? `+${c.chat.split('@')[0]}` : '');

  async function encontrar(chat) {
    const formas = await almacen.formas(chat);
    return (await almacen.resumenChats()).find((c) => formas.includes(c.chat) || c.chat === chat) ?? null;
  }

  const noEncontrado = () => ({
    estado: 404,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Chat no encontrado</title></head><body style="font:16px/1.5 system-ui;max-width:560px;margin:48px auto;padding:0 16px"><h1>No hay mensajes de ese chat</h1><p>Puede que el enlace esté incompleto o que aún no haya llegado ningún mensaje.</p><p><a href="/">Volver a todos los chats</a></p></body></html>`,
  });

  // La lista que se ve a la izquierda, igual en la pantalla inicial y en cada chat.
  async function listaDeChats(mapa) {
    const chats = [];
    for (const c of await almacen.resumenChats()) {
      chats.push({ jid: c.chat, nombre: await nombreDe(c, mapa), numero: numeroDe(c), esGrupo: c.esGrupo, total: c.total, ultimo: c.ultimo });
    }
    return chats;
  }

  return async function manejar({ metodo, ruta, consulta = '', cuerpo }) {
    if (metodo === 'GET' && ruta === '/') {
      const { mapa, ok } = await leerNombres();
      const chats = await listaDeChats(mapa);
      return { estado: 200, html: pagina(chats, pkg.version, ok ? '' : AVISO_DESCONECTADO, ahora(), Boolean(video)) };
    }

    if (metodo === 'GET' && ruta === '/chat') {
      const jid = new URLSearchParams(consulta).get('chat');
      const c = jid ? await encontrar(jid) : null;
      if (!c) return noEncontrado();
      const { mapa } = await leerNombres();
      const hoy = diaLocal(ahora().toISOString()) === diaLocal(c.ultimo);
      const chats = await listaDeChats(mapa);
      return { estado: 200, html: paginaChat({ jid: c.chat, nombre: await nombreDe(c, mapa), esGrupo: c.esGrupo, total: c.total, primero: c.primero, ultimo: c.ultimo, hoy }, pkg.version, ahora(), chats, Boolean(video)) };
    }

    if (video && metodo === 'GET' && ruta === '/video') {
      const { mapa } = await leerNombres();
      return { estado: 200, html: paginaVideo(await listaDeChats(mapa), pkg.version, ahora()) };
    }

    if (video && metodo === 'POST' && ruta === '/video/resumen') {
      const url = cuerpo?.url;
      if (typeof url !== 'string' || !urlValida(url)) return { estado: 400, cuerpo: { error: 'Pega un enlace de Instagram que empiece con https://www.instagram.com/' } };
      if (videoEnCurso) return { estado: 429, cuerpo: { error: 'Ya hay un video en proceso. Espera a que termine.' } };
      videoEnCurso = true;
      try {
        return { estado: 200, cuerpo: { resumen: await video(url) } };
      } catch (e) {
        return { estado: 502, cuerpo: { error: e.message } };
      } finally {
        videoEnCurso = false;
      }
    }

    if (metodo === 'POST' && ruta === '/resumen') {
      const { chat, desde, hasta } = cuerpo ?? {};
      if (typeof chat !== 'string' || !chat) return { estado: 400, cuerpo: { error: 'chat requerido' } };
      if (!FECHA.test(String(desde)) || !FECHA.test(String(hasta))) {
        return { estado: 400, cuerpo: { error: 'fechas AAAA-MM-DD requeridas' } };
      }
      // El nombre sale de la lista en memoria; si Evolution no responde, el reporte sigue sin nombre.
      const { mapa } = await leerNombres();
      const nombre = (await almacen.formas(chat)).map((f) => mapa.get(f)).find(Boolean);
      const { url } = await generar({ chat, nombre, desde: inicioDelDia(desde), hasta: finDelDia(hasta) });
      return { estado: 200, cuerpo: { url } };
    }

    return { estado: 404, cuerpo: { error: 'no encontrado' } };
  };
}
