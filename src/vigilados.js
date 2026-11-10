// Lista de chats vigilados, guardada como JSON { "chats": [...] }.
// Lee y escribe de forma síncrona por operación (pocas escrituras).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Vigilados {
  constructor({ archivo }) {
    this.archivo = archivo;
  }

  #leer() {
    try {
      const datos = JSON.parse(readFileSync(this.archivo, 'utf8'));
      return Array.isArray(datos.chats) ? datos.chats : [];
    } catch {
      return [];
    }
  }

  #escribir(chats) {
    mkdirSync(dirname(this.archivo), { recursive: true });
    writeFileSync(this.archivo, JSON.stringify({ chats }, null, 2));
  }

  async lista() {
    return this.#leer();
  }

  async activar(jid) {
    const chats = this.#leer();
    if (!chats.includes(jid)) this.#escribir([...chats, jid]);
  }

  async desactivar(jid) {
    const chats = this.#leer();
    if (chats.includes(jid)) this.#escribir(chats.filter((c) => c !== jid));
  }

  async esVigilado(jid) {
    return this.#leer().includes(jid);
  }
}
