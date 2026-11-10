// Orquesta un reporte: valida chat, procesa medios, resume, renderiza y guarda.
import { procesarMedio } from './medios.js';
import { resumir } from './resumen.js';
import { renderReporte, guardarReporte } from './reporte.js';
import pkg from '../package.json' with { type: 'json' };

// `evolution` es opcional: si falta el archivo de un medio, se intenta bajarlo una vez.
export async function generarReporte({ chat, nombre, desde, hasta, almacen, vigilados, medios, dirReportes, evolution }) {
  // Primero el rechazo: antes de leer mensajes o mandar nada a Gemini.
  if (!(await vigilados.esVigilado(chat))) throw new Error('chat no vigilado');

  const { apiKey, model, fetchFn } = medios;
  const mensajes = await almacen.leer({ chat, desde, hasta });

  for (const m of mensajes) {
    if (m.tipo !== 'audio' && m.tipo !== 'imagen') continue;
    if (m.sinMedio) continue; // historial anterior a la vigilancia: no hay archivo que transcribir
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

  const markdown = await resumir({ mensajes, apiKey, model, fetchFn });
  const vigiladoDesde = (await vigilados.desdeDe?.(chat)) ?? null;
  const enlaceConversacion = `/conversacion?${new URLSearchParams({ chat, desde, hasta })}`;
  const html = renderReporte({ chat, nombre, desde, hasta, markdown, mensajes: mensajes.length, vigiladoDesde, version: pkg.version, enlaceConversacion });
  const id = await guardarReporte({ dir: dirReportes, html });
  return { id, url: `/reportes/${id}` };
}
