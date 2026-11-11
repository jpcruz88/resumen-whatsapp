// Orquesta un reporte: valida chat, procesa medios, resume, renderiza y guarda.
import { procesarMedio } from './medios.js';
import { resumir } from './resumen.js';
import { conNombres } from './nombres.js';
import { renderReporte, guardarReporte, nuevoIdReporte } from './reporte.js';
import pkg from '../package.json' with { type: 'json' };

// `evolution` es opcional: si falta el archivo de un medio, se intenta bajarlo una vez.
export async function generarReporte({ chat, nombre, desde, hasta, almacen, vigilados, medios, dirReportes, evolution, nombres }) {
  // Primero el rechazo: antes de leer mensajes o mandar nada a Gemini.
  if (!(await vigilados.esVigilado(chat))) throw new Error('chat no vigilado');

  const { apiKey, model, fetchFn } = medios;
  const mensajes = await almacen.leer({ chat, desde, hasta });

  for (const m of mensajes) {
    if (m.tipo !== 'audio' && m.tipo !== 'imagen') continue;
    // Historial anterior a la vigilancia: solo se transcribe si ya se recuperó el archivo.
    if (m.sinMedio && !(await almacen.localizarMedio({ mediaId: m.mediaId, mimetype: m.mimetype }))) continue;
    try {
      const procesar = (ruta, mimetype) => procesarMedio({ tipo: m.tipo, ruta, mimetype, apiKey, model, fetchFn });
      const hallado = await almacen.localizarMedio({ mediaId: m.mediaId, mimetype: m.mimetype });
      try {
        m.textoMedia = await procesar(
          hallado?.ruta ?? almacen.rutaMedio({ mediaId: m.mediaId, mimetype: m.mimetype }),
          hallado?.mimetype ?? m.mimetype,
        );
      } catch (e) {
        // Solo si el archivo no existe (la transcripción en caché se usa antes de leerlo).
        if (!evolution || e.cause?.code !== 'ENOENT') throw e;
        const d = await evolution.descargarMedia(m.mediaId, m.chat);
        const mimetype = m.mimetype || d.mimetype;
        const ruta = await almacen.guardarMedio({ chat: m.chat, mediaId: m.mediaId, mimetype, buffer: d.buffer });
        m.textoMedia = await procesar(ruta, mimetype);
      }
    } catch {
      m.textoMedia = 'no se pudo procesar';
    }
  }

  // A Gemini le llegan nombres de personas, no números internos de WhatsApp.
  const mapaNombres = await Promise.resolve(nombres?.()).catch(() => undefined);
  const markdown = await resumir({ mensajes: conNombres(mensajes, mapaNombres), apiKey, model, fetchFn });
  // Si el periodo no tiene mensajes, el reporte dice de qué fechas sí hay.
  let guardados = null;
  if (mensajes.length === 0) {
    const todos = await almacen.leer({ chat });
    if (todos.length > 0) guardados = { primero: todos[0].fecha, ultimo: todos[todos.length - 1].fecha };
  }
  const id = nuevoIdReporte(); // se conoce antes de escribir para que la conversación pueda volver a este reporte
  const enlaceConversacion = `/conversacion?${new URLSearchParams({ chat, desde, hasta, reporte: id })}`;
  const html = renderReporte({ chat, nombre, desde, hasta, markdown, mensajes: mensajes.length, guardados, version: pkg.version, enlaceConversacion });
  await guardarReporte({ dir: dirReportes, html, id });
  return { id, url: `/reportes/${id}` };
}
