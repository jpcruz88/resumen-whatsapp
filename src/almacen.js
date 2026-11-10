// Guarda mensajes en un JSONL por chat. Solo acepta chats de la lista de vigilados.
import { appendFile, readFile, writeFile, mkdir, access } from 'node:fs/promises';
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

  async guardar(m) {
    if (!m || !(await this.vigilados.esVigilado(m.chat))) return false;
    await mkdir(this.dir, { recursive: true });
    const ruta = this.archivo(m.chat);
    const existentes = await this.#ids(ruta);
    if (existentes.has(m.id)) return false;
    await appendFile(ruta, JSON.stringify(m) + '\n');
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

  async #ids(ruta) {
    try {
      const c = await readFile(ruta, 'utf8');
      return new Set(c.split('\n').filter(Boolean).map((l) => JSON.parse(l).id));
    } catch {
      return new Set();
    }
  }
}
