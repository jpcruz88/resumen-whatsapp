// Cliente mínimo de Evolution API: descarga medios y lista contactos y grupos. Nunca envía mensajes.
// Los nombres que no empiezan con letra o número (".", emojis, signos) van al final: son ruido, no contactos.
const empiezaConLetra = (n) => /^[\p{L}\p{N}]/u.test(String(n ?? '').trim());
const porNombre = (a, b) => {
  const ga = empiezaConLetra(a.nombre) ? 0 : 1;
  const gb = empiezaConLetra(b.nombre) ? 0 : 1;
  if (ga !== gb) return ga - gb;
  return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');
};

export function crearClienteEvolution({ url, apiKey, instancia, fetchFn = fetch, timeoutMs = 30000 }) {
  async function post(ruta, cuerpo) {
    const r = await fetchFn(`${url}${ruta}/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`Evolution respondió ${r.status} en ${ruta}`);
    return r.json();
  }

  // Lista oficial de grupos vigentes y con su nombre real (subject). La lista de contactos puede traer
  // grupos que ya no existen y omitir los nuevos.
  async function obtenerGrupos() {
    const r = await fetchFn(`${url}/group/fetchAllGroups/${instancia}?getParticipants=false`, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`Evolution respondió ${r.status} en fetchAllGroups`);
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
    // jid -> nombre de todos los contactos (número y @lid). Sirve para poner nombre a quien el historial
    // trae solo con su número interno.
    async mapaNombres() {
      const contactos = await post('/chat/findContacts', { where: {} });
      const mapa = new Map();
      for (const c of contactos) {
        if (c?.remoteJid && typeof c.pushName === 'string' && c.pushName.trim() !== '') mapa.set(c.remoteJid, c.pushName);
      }
      return mapa;
    },
    // Con el historial apagado Evolution no guarda chats (findChats viene vacío): los contactos
    // son la fuente real. Se unen ambas listas; se quitan bots y difusiones y se marcan los grupos.
    async listarChats() {
      const [chats, contactos, grupos] = await Promise.all([
        post('/chat/findChats', {}),
        post('/chat/findContacts', { where: {} }),
        obtenerGrupos().catch(() => null), // si falla, se usan los grupos de la lista de contactos
      ]);
      const gruposVigentes = Array.isArray(grupos) ? grupos : null;
      const porJid = new Map();
      for (const c of [...chats, ...contactos]) {
        const jid = c?.remoteJid;
        if (!jid) continue;
        const grupo = jid.endsWith('@g.us');
        if (grupo && gruposVigentes) continue; // con la lista oficial, los grupos salen de ahí
        if (!grupo && !/@(s\.whatsapp\.net|lid)$/.test(jid)) continue;
        const nombre = c.pushName ?? null;
        const previo = porJid.get(jid);
        if (!previo || (previo.nombre == null && nombre != null)) {
          porJid.set(jid, grupo ? { jid, nombre, grupo: true } : { jid, nombre });
        }
      }
      for (const g of gruposVigentes ?? []) {
        if (typeof g?.id === 'string' && g.id.endsWith('@g.us')) {
          porJid.set(g.id, { jid: g.id, nombre: g.subject ?? null, grupo: true });
        }
      }
      const clave = (n) => String(n ?? '').trim().toLowerCase();
      // Una misma persona aparece como número y como @lid: se queda el número.
      const conNumero = new Set();
      for (const x of porJid.values()) {
        if (x.jid.endsWith('@s.whatsapp.net') && x.nombre != null) conNumero.add(clave(x.nombre));
      }
      return [...porJid.values()]
        .filter((x) => !(x.jid.endsWith('@lid') && x.nombre != null && conNumero.has(clave(x.nombre))))
        .sort(porNombre);
    },
  };
}
