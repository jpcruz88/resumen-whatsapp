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

// Se agrega solo cuando la conversación es de un grupo: ahí escriben varias personas.
const NOTA_GRUPO = `

Esta conversación es de un grupo: escriben varias personas y cada línea empieza con el nombre de quien escribió.
En las tareas indica quién las pidió y no le atribuyas a una persona lo que dijo otra.
Si una tarea es para otra persona y no para mí, no la pongas en "Tareas que me pidieron"; menciónala en los temas.`;

// Texto visible de un mensaje: audio e imagen usan su textoMedia
// (transcripción o descripción); si no hay nada, se marca como no procesado.
function textoDe(m) {
  if ((m.tipo === 'audio' || m.tipo === 'imagen') && m.sinMedio && !m.textoMedia) {
    // Historial de antes de vigilar: el archivo ya no se puede pedir, solo se conserva el texto.
    return [m.texto, `[${m.tipo === 'audio' ? 'audio' : 'imagen'} anterior a la vigilancia: no disponible]`].filter(Boolean).join(' | ');
  }
  if (m.tipo === 'audio' || m.tipo === 'imagen') {
    const partes = [m.texto, m.textoMedia].filter(Boolean);
    if (partes.length > 0) return partes.join(' | ');
    return m.tipo === 'audio' ? '[audio no procesado]' : '[imagen no procesada]';
  }
  return m.texto ?? '';
}

function quienEs(m, grupo) {
  if (m.propio) return 'yo';
  if (!grupo) return 'contacto';
  return String(m.nombre ?? '').trim() || 'alguien del grupo';
}

export function construirPrompt(mensajes) {
  const grupo = mensajes.some((m) => m.esGrupo);
  const lineas = mensajes.map((m) => `[${formatoLocal(m.fecha)}] ${quienEs(m, grupo)}: ${textoDe(m)}`);
  return `${INSTRUCCIONES}${grupo ? NOTA_GRUPO : ''}\n\nConversación:\n${lineas.join('\n')}`;
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
