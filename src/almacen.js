// Guarda mensajes en un JSONL por chat. Solo acepta chats de la lista permitida.
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export class Almacen {
  constructor({ dir, chatsPermitidos }) {
    this.dir = dir;
    this.permitidos = new Set(chatsPermitidos);
  }

  archivo(chat) {
    const nombre = createHash('sha256').update(chat).digest('hex').slice(0, 16);
    return join(this.dir, `${nombre}.jsonl`);
  }

  async guardar(m) {
    if (!m || !this.permitidos.has(m.chat)) return false;
    await mkdir(this.dir, { recursive: true });
    const ruta = this.archivo(m.chat);
    const existentes = await this.#ids(ruta);
    if (existentes.has(m.id)) return false;
    await appendFile(ruta, JSON.stringify(m) + '\n');
    return true;
  }

  async leer({ chat, desde, hasta }) {
    if (!this.permitidos.has(chat)) return [];
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
