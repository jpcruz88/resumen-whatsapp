// Normaliza un evento messages.upsert de Evolution API v2.
// Devuelve null si el evento no es un mensaje con texto.
export function parsearEventoEvolution(payload) {
  if (!payload || payload.event !== 'messages.upsert' || !payload.data) return null;
  const d = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!d || !d.key || !d.message) return null;

  const msg = d.message;
  const texto =
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    null;
  if (!texto || !texto.trim()) return null;

  const ts = Number(d.messageTimestamp ?? 0);
  return {
    id: d.key.id,
    chat: d.key.remoteJid,
    propio: d.key.fromMe === true,
    nombre: d.pushName ?? '',
    texto: texto.trim(),
    fecha: new Date(ts * 1000).toISOString(),
  };
}
