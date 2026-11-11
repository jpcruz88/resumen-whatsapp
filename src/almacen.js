// Guarda mensajes en un JSONL por chat. Con TodosLosChats (el modo real) se guarda todo; con una lista de
// Vigilados (modo anterior) solo los chats de la lista.
import { appendFile, rename, readFile, writeFile, mkdir, access, readdir, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';

const EXTENSIONES = {
  'audio/ogg': 'ogg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
import { createHash } from 'node:crypto';

export class Almacen {
  constructor({ dir, vigilados }) {
    this.dir = dir;
    this.vigilados = vigilados;
  }

  archivo(chat) {
    const nombre = createHash('sha256').update(chat).digest('hex').slice(0, 16);
    return join(this.dir, `${nombre}.jsonl`);
  }

  // Estados, difusiones y canales no son conversaciones: no se guardan.
  #esConversacion(jid) {
    return typeof jid === 'string' && jid !== '' && !/@(broadcast|newsletter)$/.test(jid);
  }

  // Modo "todos los chats": ninguna lista de vigilados, todo se guarda completo.
  get #todos() {
    return this.vigilados?.todos === true;
  }

  // Una persona llega como @lid y como número: se guarda bajo el número y se recuerda la equivalencia en alias.json.
  async #alias() {
    if (!this._alias) {
      try {
        this._alias = new Map(Object.entries(JSON.parse(await readFile(join(this.dir, 'alias.json'), 'utf8'))));
      } catch {
        this._alias = new Map();
      }
    }
    return this._alias;
  }

  async #aprender(m) {
    if (!m?.chat?.endsWith('@lid') || !m.chatAlt?.endsWith('@s.whatsapp.net')) return;
    const alias = await this.#alias();
    if (alias.get(m.chat) === m.chatAlt) return;
    alias.set(m.chat, m.chatAlt);
    await mkdir(this.dir, { recursive: true });
    const temporal = join(this.dir, 'alias.json.tmp');
    await writeFile(temporal, JSON.stringify(Object.fromEntries(alias)));
    await rename(temporal, join(this.dir, 'alias.json'));
  }

  async canonico(jid) {
    return (await this.#alias()).get(jid) ?? jid;
  }

  // Todos los ids que son el mismo chat que `chat` (él mismo, su forma canónica y sus @lid).
  async formas(chat) {
    return this.#claves(chat);
  }

  async #claves(chat) {
    if (!this.#todos) return [chat];
    const alias = await this.#alias();
    const canonico = alias.get(chat) ?? chat;
    return [...new Set([canonico, chat, ...[...alias].filter(([, n]) => n === canonico).map(([l]) => l)])];
  }

  async #registrosDe(chat) {
    const vistos = new Set();
    const todos = [];
    for (const clave of await this.#claves(chat)) {
      for (const r of await this.#registros(this.archivo(clave))) {
        if (vistos.has(r.id)) continue;
        vistos.add(r.id);
        todos.push(r);
      }
    }
    return todos;
  }

  // El chat vigilado al que pertenece un mensaje: el directo, o el alterno (la otra forma del id
  // de la misma persona). null si ninguno está vigilado.
  async resolverChat(m) {
    if (!m) return null;
    if (this.#todos) {
      if (!this.#esConversacion(m.chat)) return null;
      await this.#aprender(m);
      return this.canonico(m.chat);
    }
    if (m.chat && (await this.vigilados.esVigilado(m.chat))) return m.chat;
    if (m.chatAlt && (await this.vigilados.esVigilado(m.chatAlt))) return m.chatAlt;
    return null;
  }

  // Guarda de una vez un lote (el historial trae miles de mensajes). Una sola lectura de la lista de
  // vigilados y una por archivo de chat; lo que no es de un chat vigilado se descarta sin escribir nada.
  // Devuelve cuántos mensajes nuevos guardó.
  async guardarLote(mensajes) {
    return (await this.guardarLoteDetallado(mensajes)).nuevos;
  }

  // Igual, pero cuenta también los mensajes viejos a los que se les completaron los datos para volver a pedir
  // su imagen o audio (el historial se importó antes de guardarlos). Reescribe el archivo solo si hace falta.
  async guardarLoteDetallado(mensajes) {
    const todos = this.#todos;
    const vigilados = new Set(todos ? [] : await this.vigilados.lista());
    const total = { nuevos: 0, actualizados: 0 };
    const porChat = new Map();
    for (const m of mensajes) {
      if (!m) continue;
      let chat;
      if (todos) {
        if (!this.#esConversacion(m.chat)) continue;
        await this.#aprender(m);
        chat = await this.canonico(m.chat);
      } else {
        chat = vigilados.has(m.chat) ? m.chat : m.chatAlt && vigilados.has(m.chatAlt) ? m.chatAlt : null;
      }
      if (!chat) continue;
      if (!porChat.has(chat)) porChat.set(chat, []);
      porChat.get(chat).push({ ...m, chat });
    }
    for (const [chat, lista] of porChat) {
      await mkdir(this.dir, { recursive: true });
      const ruta = this.archivo(chat);
      const registros = await this.#registros(ruta);
      const posicion = new Map(registros.map((r, i) => [r.id, i]));
      let actualizados = 0;
      const nuevos = [];
      for (const m of lista) {
        // Mismas reglas que guardar(): ni el base64 ni chatAlt entran al archivo.
        const { base64: _base64, chatAlt: _chatAlt, ...paraGuardar } = m;
        if (posicion.has(m.id)) {
          const i = posicion.get(m.id);
          if (paraGuardar.medio && !registros[i].medio) { registros[i] = { ...registros[i], medio: paraGuardar.medio }; actualizados++; }
          continue;
        }
        posicion.set(m.id, registros.length + nuevos.length);
        nuevos.push(paraGuardar);
      }
      if (actualizados > 0) {
        // Se reescribe entero y se reemplaza de una vez: nunca queda un archivo a medias.
        const temporal = `${ruta}.tmp`;
        await writeFile(temporal, [...registros, ...nuevos].map((r) => JSON.stringify(r)).join('\n') + '\n');
        await rename(temporal, ruta);
      } else if (nuevos.length > 0) {
        await appendFile(ruta, nuevos.map((r) => JSON.stringify(r)).join('\n') + '\n');
      }
      total.nuevos += nuevos.length;
      total.actualizados += actualizados;
    }
    return total;
  }

  async buscarMensaje({ chat, id }) {
    if (!(await this.vigilados.esVigilado(chat))) return null;
    return (await this.#registrosDe(chat)).find((r) => r.id === id) ?? null;
  }

  async guardar(m) {
    if (!m || !(await this.vigilados.esVigilado(m.chat))) return false;
    await mkdir(this.dir, { recursive: true });
    const ruta = this.archivo(m.chat);
    const existentes = await this.#ids(ruta);
    if (existentes.has(m.id)) return false;
    // El base64 del medio viaja solo en memoria hacia guardarMedio; nunca entra al JSONL.
    // chatAlt solo sirve para resolver el chat vigilado.
    const { base64: _base64, chatAlt: _chatAlt, ...paraGuardar } = m;
    await appendFile(ruta, JSON.stringify(paraGuardar) + '\n');
    return true;
  }

  // Ruta de un medio: <dir>/media/<mediaId>.<ext>. Unico lugar donde vive la convencion.
  rutaMedio({ mediaId, mimetype }) {
    const base = String(mimetype || '').split(';')[0].trim().toLowerCase();
    const ext = EXTENSIONES[base] ?? 'bin';
    return join(this.dir, 'media', `${basename(String(mediaId))}.${ext}`);
  }

  // Dónde está el archivo de un medio y con qué mimetype leerlo. Con mimetype, la ruta es la de
  // rutaMedio(). Sin mimetype (el parseado no lo traía y se guardó con el de Evolution), busca
  // la extensión conocida que exista. Devuelve null si el archivo no está.
  async localizarMedio({ mediaId, mimetype }) {
    const existe = (ruta) => access(ruta).then(() => true, () => false);
    if (mimetype) {
      const ruta = this.rutaMedio({ mediaId, mimetype });
      return (await existe(ruta)) ? { ruta, mimetype } : null;
    }
    for (const [base, ext] of Object.entries(EXTENSIONES)) {
      const ruta = this.rutaMedio({ mediaId, mimetype: base });
      if (await existe(ruta)) return { ruta, mimetype: base };
    }
    return null;
  }

  // Transcripción o descripción que dejó procesarMedio junto al archivo (<archivo>.txt), si existe.
  async leerTranscripcion({ mediaId, mimetype }) {
    const hallado = await this.localizarMedio({ mediaId, mimetype });
    if (!hallado) return null;
    try {
      const texto = (await readFile(hallado.ruta + '.txt', 'utf8')).trim();
      return texto || null;
    } catch {
      return null;
    }
  }

  // Guarda el archivo de un mensaje en rutaMedio().
  async guardarMedio({ chat, mediaId, mimetype, buffer }) {
    if (!(await this.vigilados.esVigilado(chat))) return null;
    const ruta = this.rutaMedio({ mediaId, mimetype });
    await mkdir(join(this.dir, 'media'), { recursive: true });
    await writeFile(ruta, buffer);
    return ruta;
  }

  async leer({ chat, desde, hasta }) {
    if (!(await this.vigilados.esVigilado(chat))) return [];
    const registros = await this.#registrosDe(chat);
    const d = desde ? Date.parse(desde) : -Infinity;
    const h = hasta ? Date.parse(hasta) : Infinity;
    return registros
      .filter((m) => {
        const t = Date.parse(m.fecha);
        return t >= d && t <= h;
      })
      .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
  }

  // Cada chat guardado con su total y fechas, el más reciente primero. Junta las dos formas del id de una persona.
  async resumenChats() {
    let archivos = [];
    try {
      archivos = (await readdir(this.dir)).filter((f) => /^[0-9a-f]{16}\.jsonl$/.test(f));
    } catch {
      return [];
    }
    const porChat = new Map();
    for (const f of archivos) {
      for (const r of await this.#registros(join(this.dir, f))) {
        if (!r.chat) continue;
        const chat = await this.canonico(r.chat);
        const c = porChat.get(chat) ?? { chat, total: 0, primero: r.fecha, ultimo: r.fecha, ids: new Set() };
        if (c.ids.has(r.id)) continue;
        c.ids.add(r.id);
        c.total++;
        if (r.fecha < c.primero) c.primero = r.fecha;
        if (r.fecha > c.ultimo) c.ultimo = r.fecha;
        porChat.set(chat, c);
      }
    }
    return [...porChat.values()]
      .map(({ ids: _ids, ...c }) => ({ ...c, esGrupo: c.chat.endsWith('@g.us') }))
      .sort((a, b) => (a.ultimo < b.ultimo ? 1 : a.ultimo > b.ultimo ? -1 : 0));
  }

  // Pasa lo que había en el buzón (de cuando se elegían chats a vigilar) al almacén de todos los chats.
  async migrarBuzon() {
    const carpeta = join(this.dir, 'buzon');
    let archivos;
    try {
      archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      return 0;
    }
    let nuevos = 0;
    for (const f of archivos) {
      const registros = await this.#registros(join(carpeta, f));
      nuevos += (await this.guardarLoteDetallado(registros)).nuevos;
      await unlink(join(carpeta, f));
    }
    return nuevos;
  }

  async #registros(ruta) {
    try {
      return (await readFile(ruta, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  async #ids(ruta) {
    try {
      const c = await readFile(ruta, 'utf8');
      return new Set(c.split('\n').filter(Boolean).map((l) => JSON.parse(l).id));
    } catch {
      return new Set();
    }
  }
}
