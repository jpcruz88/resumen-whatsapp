// Lista de chats vigilados, guardada como JSON { "chats": [...], "desde": { jid: ISO } }.
// "desde" es cuándo se empezó a vigilar cada chat; un archivo sin él (formato anterior) sigue funcionando.
// Lee y escribe de forma síncrona por operación (pocas escrituras).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Vigilados {
  constructor({ archivo }) {
    this.archivo = archivo;
  }

  #leerTodo() {
    try {
      const datos = JSON.parse(readFileSync(this.archivo, 'utf8'));
      const chats = Array.isArray(datos.chats) ? datos.chats : [];
      const desde = datos.desde && typeof datos.desde === 'object' && !Array.isArray(datos.desde) ? datos.desde : {};
      return { chats, desde };
    } catch {
      return { chats: [], desde: {} };
    }
  }

  #leer() {
    return this.#leerTodo().chats;
  }

  #escribir(chats, desde) {
    mkdirSync(dirname(this.archivo), { recursive: true });
    writeFileSync(this.archivo, JSON.stringify({ chats, desde }, null, 2));
  }

  async lista() {
    return this.#leer();
  }

  async activar(jid) {
    const { chats, desde } = this.#leerTodo();
    if (chats.includes(jid)) return;
    this.#escribir([...chats, jid], { ...desde, [jid]: new Date().toISOString() });
  }

  async desactivar(jid) {
    const { chats, desde } = this.#leerTodo();
    if (!chats.includes(jid)) return;
    const { [jid]: _olvidado, ...resto } = desde;
    this.#escribir(chats.filter((c) => c !== jid), resto);
  }

  // Cuándo se empezó a vigilar el chat (ISO), o null si no se sabe.
  async desdeDe(jid) {
    return this.#leerTodo().desde[jid] ?? null;
  }

  async esVigilado(jid) {
    return this.#leer().includes(jid);
  }
}
