// Arma el prompt y llama a Gemini (REST) para separar trabajo y personal.
import { formatoLocal } from './fechas.js';

const INSTRUCCIONES = `Eres un asistente que resume conversaciones de WhatsApp para su dueño.
"yo" es el dueño; los demás son sus contactos.
Responde en español, solo con JSON que tenga tres listas:
- "tareas": lo que me pidieron hacer; lista vacía si no hay. Cada una con "tarea" (qué hay que hacer, en una frase corta que empiece con verbo), "quien" (quién la pidió) y "cuando" (la fecha y hora del mensaje donde se pidió, citada tal cual en la forma [AAAA-MM-DD HH:MM]).
- "temas": temas de trabajo. Cada uno con "titulo" (de 2 a 5 palabras) y "detalle" (una o dos frases).
- "personal": temas personales. Cada uno con "titulo" y "detalle"; sin detalles sensibles innecesarios.
Si un tema es ambiguo, ponlo en "personal" y escribe (?) al final del detalle.
No inventes nada que no esté en los mensajes.`;

const ESQUEMA = (() => {
  const cadena = { type: 'STRING' };
  const lista = (propiedades) => ({
    type: 'ARRAY',
    items: { type: 'OBJECT', properties: propiedades, required: Object.keys(propiedades) },
  });
  return {
    type: 'OBJECT',
    properties: {
      tareas: lista({ tarea: cadena, quien: cadena, cuando: cadena }),
      temas: lista({ titulo: cadena, detalle: cadena }),
      personal: lista({ titulo: cadena, detalle: cadena }),
    },
    required: ['tareas', 'temas', 'personal'],
  };
})();

const limpio = (v) => (typeof v === 'string' ? v.trim() : '');

// El JSON de Gemini, ya limpio; null si no tiene la forma pedida.
function leerEstructura(texto) {
  let d;
  try { d = JSON.parse(texto); } catch { return null; }
  if (!d || !Array.isArray(d.tareas) || !Array.isArray(d.temas) || !Array.isArray(d.personal)) return null;
  const tema = (x) => ({ titulo: limpio(x?.titulo), detalle: limpio(x?.detalle) });
  return {
    tareas: d.tareas.map((x) => ({ tarea: limpio(x?.tarea), quien: limpio(x?.quien), cuando: limpio(x?.cuando) })).filter((x) => x.tarea),
    temas: d.temas.map(tema).filter((x) => x.titulo || x.detalle),
    personal: d.personal.map(tema).filter((x) => x.titulo || x.detalle),
  };
}

// Se agrega solo cuando la conversación es de un grupo: ahí escriben varias personas.
const NOTA_GRUPO = `

Esta conversación es de un grupo: escriben varias personas y cada línea empieza con el nombre de quien escribió.
En las tareas indica quién las pidió y no le atribuyas a una persona lo que dijo otra.
Si una tarea es para otra persona y no para mí, no la pongas en "Tareas que me pidieron"; menciónala en los temas.`;

// Texto visible de un mensaje: audio e imagen usan su textoMedia
// (transcripción o descripción); si no hay nada, se marca como no procesado.
function textoDe(m) {
  if ((m.tipo === 'audio' || m.tipo === 'imagen') && m.sinMedio && !m.textoMedia) {
    // Historial de WhatsApp: el archivo ya no se puede pedir, solo se conserva el texto.
    return [m.texto, `[${m.tipo === 'audio' ? 'audio' : 'imagen'} del historial: no disponible]`].filter(Boolean).join(' | ');
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
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: ESQUEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
  const json = await res.json();
  const texto = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error('Gemini no devolvió texto');
  // Con la forma pedida: { tareas, temas, personal }. Si no, el texto tal cual (se muestra como Markdown).
  return leerEstructura(texto) ?? texto;
}
