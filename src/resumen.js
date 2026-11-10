// Arma el prompt y llama a Gemini (REST) para separar trabajo y personal.
import { formatoLocal } from './fechas.js';

const INSTRUCCIONES = `Eres un asistente que resume conversaciones de WhatsApp para su dueño.
"yo" es el dueño; los demás son sus contactos.
Responde en español, en este formato exacto:

## Trabajo
### Tareas que me pidieron
- (tarea, quién la pidió, y la fecha y hora del mensaje donde se pidió, citadas tal cual en la forma [AAAA-MM-DD HH:MM]). Si no hay, escribe "Ninguna".
### Temas de trabajo
- (resumen corto por tema)

## Personal
- (resumen corto por tema; sin detalles sensibles innecesarios)

Si un tema es ambiguo, ponlo en Personal y márcalo con (?).
No inventes nada que no esté en los mensajes.`;

// Texto visible de un mensaje: audio e imagen usan su textoMedia
// (transcripción o descripción); si no hay nada, se marca como no procesado.
function textoDe(m) {
  if (m.tipo === 'audio' || m.tipo === 'imagen') {
    const partes = [m.texto, m.textoMedia].filter(Boolean);
    if (partes.length > 0) return partes.join(' | ');
    return m.tipo === 'audio' ? '[audio no procesado]' : '[imagen no procesada]';
  }
  return m.texto ?? '';
}

export function construirPrompt(mensajes) {
  const lineas = mensajes.map((m) => {
    const quien = m.propio ? 'yo' : 'contacto';
    return `[${formatoLocal(m.fecha)}] ${quien}: ${textoDe(m)}`;
  });
  return `${INSTRUCCIONES}\n\nConversación:\n${lineas.join('\n')}`;
}

export async function resumir({
  mensajes,
  apiKey,
  model = 'gemini-3.1-flash-lite',
  fetchFn = fetch,
}) {
  if (!mensajes || mensajes.length === 0) {
    return 'No hay mensajes en ese periodo.';
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: construirPrompt(mensajes) }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
  const json = await res.json();
  const texto = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error('Gemini no devolvió texto');
  return texto;
}
