// Normaliza un evento messages.upsert de Evolution API v2.
// Devuelve null si el evento no es texto, audio o imagen, o si es de un grupo.
export function parsearEventoEvolution(payload) {
  if (!payload || payload.event !== 'messages.upsert' || !payload.data) return null;
  const d = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!d || !d.key || !d.message) return null;
  if (String(d.key.remoteJid ?? '').endsWith('@g.us')) return null;

  const msg = d.message;
  let tipo;
  let texto = null;
  let mediaId = null;
  let mimetype = null;

  const textoPlano = msg.conversation ?? msg.extendedTextMessage?.text ?? null;
  if (textoPlano !== null) {
    if (!textoPlano.trim()) return null;
    tipo = 'texto';
    texto = textoPlano.trim();
  } else if (msg.audioMessage) {
    tipo = 'audio';
    mediaId = d.key.id;
    mimetype = msg.audioMessage.mimetype ?? null;
  } else if (msg.imageMessage) {
    tipo = 'imagen';
    mediaId = d.key.id;
    mimetype = msg.imageMessage.mimetype ?? null;
    const caption = msg.imageMessage.caption;
    texto = caption && caption.trim() ? caption.trim() : null;
  } else {
    return null;
  }

  const ts = Number(d.messageTimestamp ?? 0);
  return {
    id: d.key.id,
    chat: d.key.remoteJid,
    propio: d.key.fromMe === true,
    nombre: d.pushName ?? '',
    tipo,
    texto,
    mediaId,
    mimetype,
    fecha: new Date(ts * 1000).toISOString(),
  };
}
