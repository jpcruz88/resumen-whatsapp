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
  let base64 = null;

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
    mediaId = d.key.id;
    mimetype = msg.audioMessage.mimetype ?? null;
    base64 = leerBase64();
  } else if (msg.imageMessage) {
    tipo = 'imagen';
    mediaId = d.key.id;
    mimetype = msg.imageMessage.mimetype ?? null;
    base64 = leerBase64();
    const caption = msg.imageMessage.caption;
    texto = caption && caption.trim() ? caption.trim() : null;
  } else {
    return null;
  }

  const ts = Number(d.messageTimestamp ?? 0);
  const parseado = {
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
  // Solo audio e imagen llevan el campo; el texto queda igual que antes.
  if (tipo !== 'texto') parseado.base64 = base64;
  return parseado;
}
