// Normaliza un evento messages.upsert de Evolution API v2.
// Devuelve null si el evento no es texto, audio o imagen. Los grupos se aceptan: llevan esGrupo y autor.
// Datos con los que WhatsApp permite volver a pedir un archivo. Evolution los manda en el historial: bytes como
// objeto {0:..}, como lista o como base64, y números largos de protobuf. Se normalizan y se descarta todo lo
// demás (miniaturas, formas de onda...), que pesa mucho y no sirve para descargar.
const CLAVES_MEDIO = ['url', 'directPath', 'mediaKey', 'fileEncSha256', 'fileSha256', 'fileLength', 'mimetype', 'mediaKeyTimestamp', 'seconds', 'ptt', 'height', 'width'];
const BYTES = new Set(['mediaKey', 'fileEncSha256', 'fileSha256']);
const NUMEROS = new Set(['fileLength', 'mediaKeyTimestamp']);

function aBytes(v) {
  if (typeof v === 'string') { const b = Buffer.from(v, 'base64'); return b.length > 0 ? Array.from(b) : null; }
  if (v && typeof v === 'object') {
    const lista = Array.isArray(v) ? v : Object.values(v);
    return lista.length > 0 && lista.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? lista : null;
  }
  return null;
}

function aNumero(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  if (v && typeof v === 'object' && 'low' in v) return (v.low >>> 0) + (v.high >>> 0) * 2 ** 32;
  return undefined;
}

function extraerMedio(contenido) {
  if (!contenido || typeof contenido !== 'object') return null;
  const salida = {};
  for (const clave of CLAVES_MEDIO) {
    const v = contenido[clave];
    if (v === undefined || v === null) continue;
    const limpio = BYTES.has(clave) ? aBytes(v) : NUMEROS.has(clave) ? aNumero(v) : v;
    if (limpio !== null && limpio !== undefined) salida[clave] = limpio;
  }
  // Sin la clave del archivo o sin dónde está no se puede pedir: no se guarda algo inservible.
  return salida.mediaKey && (salida.directPath || salida.url) ? salida : null;
}

export function parsearEventoEvolution(payload) {
  if (!payload || payload.event !== 'messages.upsert' || !payload.data) return null;
  const d = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  return normalizar(d);
}

// Historial que WhatsApp manda al vincular el dispositivo: un lote messages.set con muchos mensajes en el
// mismo formato que messages.upsert. Los audios e imágenes viejos no traen el archivo y no se pueden
// pedir después, así que se marcan sinMedio.
export function parsearHistorial(payload) {
  if (!payload || payload.event !== 'messages.set' || !Array.isArray(payload.data)) return [];
  const mensajes = [];
  for (const d of payload.data) {
    const m = normalizar(d);
    if (!m) continue;
    if (m.tipo !== 'texto') {
      delete m.base64;
      m.sinMedio = true;
    }
    mensajes.push(m);
  }
  return mensajes;
}

function normalizar(d) {
  if (!d || !d.key || !d.message) return null;

  const msg = d.message;
  let tipo;
  let texto = null;
  let mediaId = null;
  let mimetype = null;
  let base64 = null;
  let medio = null;

  // Con webhook.base64 activo, Evolution manda el medio en el propio payload. La ruta documentada
  // es data.message.base64; se acepta también data.base64 por si la instancia lo pone ahí.
  const leerBase64 = () => {
    const b = msg.base64 ?? d.base64;
    return typeof b === 'string' && b ? b : null;
  };

  const textoPlano = msg.conversation ?? msg.extendedTextMessage?.text ?? null;
  if (textoPlano !== null) {
    if (!textoPlano.trim()) return null;
    tipo = 'texto';
    texto = textoPlano.trim();
  } else if (msg.audioMessage) {
    tipo = 'audio';
    medio = extraerMedio(msg.audioMessage);
    mediaId = d.key.id;
    mimetype = msg.audioMessage.mimetype ?? null;
    base64 = leerBase64();
  } else if (msg.imageMessage) {
    tipo = 'imagen';
    medio = extraerMedio(msg.imageMessage);
    mediaId = d.key.id;
    mimetype = msg.imageMessage.mimetype ?? null;
    base64 = leerBase64();
    const caption = msg.imageMessage.caption;
    texto = caption && caption.trim() ? caption.trim() : null;
  } else {
    return null;
  }

  const ts = Number(d.messageTimestamp ?? 0);
  // remoteJidAlt guarda la otra forma del id de la misma persona (número o @lid). Un grupo no vale.
  const alt = d.key.remoteJidAlt;
  const chatAlt = typeof alt === 'string' && alt && !alt.endsWith('@g.us') ? alt : null;
  const parseado = {
    id: d.key.id,
    chat: d.key.remoteJid,
    chatAlt,
    propio: d.key.fromMe === true,
    nombre: d.pushName ?? '',
    tipo,
    texto,
    mediaId,
    mimetype,
    fecha: new Date(ts * 1000).toISOString(),
  };
  // Solo audio e imagen llevan el campo; el texto queda igual que antes.
  if (tipo !== 'texto') {
    parseado.base64 = base64;
    if (medio) parseado.medio = medio;
  }
  // En un grupo escriben varias personas: pushName es el nombre de quien escribió y participant su id.
  if (String(d.key.remoteJid ?? '').endsWith('@g.us')) {
    parseado.esGrupo = true;
    parseado.autor = typeof d.key.participant === 'string' && d.key.participant ? d.key.participant : null;
  }
  return parseado;
}
