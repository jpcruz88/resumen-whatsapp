// Guarda mensajes en un JSONL por chat. Los chats vigilados van completos (con sus archivos). Lo que llega de los
// demás chats se guarda solo como texto y datos de descarga en un buzón temporal (dir/buzon), sin leerlo ni
// resumirlo: al vigilar el chat, promover() lo pasa al almacén del chat. Así vigilar un chat no pierde su pasado.
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

  archivoBuzon(chat) {
    return join(this.dir, 'buzon', basename(this.archivo(chat)));
  }

  // Estados, difusiones y canales no son conversaciones: no se guardan.
  #esConversacion(jid) {
    return typeof jid === 'string' && jid !== '' && !/@(broadcast|newsletter)$/.test(jid);
  }

  // Guarda en el buzón lo de chats no vigilados: sin base64 ni archivos; los audios e imágenes quedan
  // marcados sinMedio con sus datos de descarga para pedirlos después. Devuelve cuántos mensajes nuevos guardó.
  async guardarEnBuzon(mensajes) {
    const porChat = new Map();
    for (const m of mensajes) {
      if (!m || !this.#esConversacion(m.chat)) continue;
      if (!porChat.has(m.chat)) porChat.set(m.chat, []);
      porChat.get(m.chat).push(m);
    }
    let guardados = 0;
    for (const [chat, lista] of porChat) {
      const ruta = this.archivoBuzon(chat);
      const ids = await this.#ids(ruta);
      const nuevos = [];
      for (const m of lista) {
        if (ids.has(m.id)) continue;
        ids.add(m.id);
        const { base64: _base64, ...paraGuardar } = m;
        if (m.tipo === 'audio' || m.tipo === 'imagen') paraGuardar.sinMedio = true;
        nuevos.push(paraGuardar);
      }
      if (nuevos.length === 0) continue;
      await mkdir(join(this.dir, 'buzon'), { recursive: true });
      await appendFile(ruta, nuevos.map((r) => JSON.stringify(r)).join('\n') + '\n');
      guardados += nuevos.length;
    }
    return guardados;
  }

  // Pasa al almacén de un chat recién vigilado lo que hubiera en el buzón (con su otro id incluido).
  // Devuelve cuántos mensajes nuevos quedaron guardados.
  async promover(chat) {
    const carpeta = join(this.dir, 'buzon');
    let archivos;
    try {
      archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      return 0;
    }
    const propio = basename(this.archivoBuzon(chat));
    const recogidos = [];
    const pendientes = [];
    for (const f of archivos) {
      const ruta = join(carpeta, f);
      const registros = await this.#registros(ruta);
      const mios = f === propio ? registros : registros.filter((r) => r.chatAlt === chat);
      if (mios.length === 0) continue;
      recogidos.push(...mios);
      pendientes.push({ ruta, resto: registros.filter((r) => !mios.includes(r)) });
    }
    if (recogidos.length === 0) return 0;
    const { nuevos } = await this.guardarLoteDetallado(recogidos.map((m) => ({ ...m, chat })));
    for (const { ruta, resto } of pendientes) await this.#reescribirOBorrar(ruta, resto);
    const primero = recogidos.map((m) => m.fecha).filter(Boolean).sort()[0];
    if (primero) await this.vigilados.ajustarDesde?.(chat, primero);
    return nuevos;
  }

  // Quita del buzón lo anterior al plazo. Devuelve cuántos mensajes borró.
  async limpiarBuzon({ dias = 120, ahora = Date.now() } = {}) {
    const limite = ahora - dias * 24 * 3600 * 1000;
    let borrados = 0;
    let archivos = [];
    try {
      archivos = (await readdir(join(this.dir, 'buzon'))).filter((f) => f.endsWith('.jsonl'));
    } catch {
      return { borrados };
    }
    for (const f of archivos) {
      const ruta = join(this.dir, 'buzon', f);
      const registros = await this.#registros(ruta);
      const vigentes = registros.filter((r) => Date.parse(r.fecha) >= limite);
      if (vigentes.length === registros.length) continue;
      borrados += registros.length - vigentes.length;
      await this.#reescribirOBorrar(ruta, vigentes);
    }
    return { borrados };
  }

  async #reescribirOBorrar(ruta, registros) {
    if (registros.length === 0) {
      await unlink(ruta).catch(() => {});
      return;
    }
    const temporal = `${ruta}.tmp`;
    await writeFile(temporal, registros.map((r) => JSON.stringify(r)).join('\n') + '\n');
    await rename(temporal, ruta);
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
    const porChat = new Map();
    const aBuzon = [];
    for (const m of mensajes) {
      if (!m) continue;
      const chat = vigilados.has(m.chat) ? m.chat : m.chatAlt && vigilados.has(m.chatAlt) ? m.chatAlt : null;
      if (!chat) { aBuzon.push(m); continue; }
      if (!porChat.has(chat)) porChat.set(chat, []);
      porChat.get(chat).push({ ...m, chat });
    }
    if (aBuzon.length > 0) await this.guardarEnBuzon(aBuzon);
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

  // Guarda el archivo de un mensaje en rutaMedio(). Solo de chats vigilados, salvo buzon: true (lo que llega de
  // un chat aún no vigilado: el archivo se guarda al llegar y se ve cuando se vigila el chat).
  async guardarMedio({ chat, mediaId, mimetype, buffer, buzon = false }) {
    if (!buzon && !(await this.vigilados.esVigilado(chat))) return null;
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
