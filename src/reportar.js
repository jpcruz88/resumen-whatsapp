// Orquesta un reporte: valida chat, procesa medios, resume, renderiza y guarda.
import { procesarMedio } from './medios.js';
import { resumir } from './resumen.js';
import { renderReporte, guardarReporte } from './reporte.js';

export async function generarReporte({ chat, desde, hasta, almacen, vigilados, medios, dirReportes }) {
  // Primero el rechazo: antes de leer mensajes o mandar nada a Gemini.
  if (!(await vigilados.esVigilado(chat))) throw new Error('chat no vigilado');

  const { apiKey, model, fetchFn } = medios;
  const mensajes = await almacen.leer({ chat, desde, hasta });

  for (const m of mensajes) {
    if (m.tipo !== 'audio' && m.tipo !== 'imagen') continue;
    try {
      m.textoMedia = await procesarMedio({
        tipo: m.tipo,
        ruta: almacen.rutaMedio({ mediaId: m.mediaId, mimetype: m.mimetype }),
        mimetype: m.mimetype,
        apiKey,
        model,
        fetchFn,
      });
    } catch {
      m.textoMedia = 'no se pudo procesar';
    }
  }

  const markdown = await resumir({ mensajes, apiKey, model, fetchFn });
  const html = renderReporte({ chat, desde, hasta, markdown });
  const id = await guardarReporte({ dir: dirReportes, html });
  return { id, url: `/reportes/${id}` };
}
