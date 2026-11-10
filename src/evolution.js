// Cliente mínimo de Evolution API: descarga medios y lista chats. Nunca envía mensajes.
export function crearClienteEvolution({ url, apiKey, instancia, fetchFn = fetch }) {
  async function post(ruta, cuerpo) {
    const r = await fetchFn(`${url}${ruta}/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(`Evolution respondió ${r.status} en ${ruta}`);
    return r.json();
  }

  return {
    // `chat` solo cumple la firma; el endpoint no lo necesita (R4).
    async descargarMedia(mediaId, chat) { // eslint-disable-line no-unused-vars
      const d = await post('/chat/getBase64FromMediaMessage', {
        message: { key: { id: mediaId } },
        convertToMp4: false,
      });
      return { buffer: Buffer.from(d.base64, 'base64'), mimetype: d.mimetype };
    },
    async listarChats() {
      const lista = await post('/chat/findChats', {});
      return lista.map((c) => ({ jid: c.id, nombre: c.pushName }));
    },
  };
}
