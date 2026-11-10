// Guarda mensajes en un JSONL por chat. Solo acepta chats de la lista de vigilados.
import { appendFile, rename, readFile, writeFile, mkdir, access } from 'node:fs/promises';
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

  // El chat vigilado al que pertenece un mensaje: el directo, o el alterno (la otra forma del id
  // de la misma persona). null si ninguno está vigilado.
  async resolverChat(m) {
    if (!m) return null;
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
    const vigilados = new Set(await this.vigilados.lista());
    const total = { nuevos: 0, actualizados: 0 };
    if (vigilados.size === 0) return total;
    const porChat = new Map();
    for (const m of mensajes) {
      if (!m) continue;
      const chat = vigilados.has(m.chat) ? m.chat : m.chatAlt && vigilados.has(m.chatAlt) ? m.chatAlt : null;
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
    return (await this.#registros(this.archivo(chat))).find((r) => r.id === id) ?? null;
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

  // Guarda el archivo de un mensaje de un chat vigilado en rutaMedio().
  async guardarMedio({ chat, mediaId, mimetype, buffer }) {
    if (!(await this.vigilados.esVigilado(chat))) return null;
    const ruta = this.rutaMedio({ mediaId, mimetype });
    await mkdir(join(this.dir, 'media'), { recursive: true });
    await writeFile(ruta, buffer);
    return ruta;
  }

  async leer({ chat, desde, hasta }) {
    if (!(await this.vigilados.esVigilado(chat))) return [];
    let contenido = '';
    try {
      contenido = await readFile(this.archivo(chat), 'utf8');
    } catch {
      return [];
    }
    const d = desde ? Date.parse(desde) : -Infinity;
    const h = hasta ? Date.parse(hasta) : Infinity;
    return contenido
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((m) => {
        const t = Date.parse(m.fecha);
        return t >= d && t <= h;
      })
      .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
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
