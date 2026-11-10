import { pathToFileURL } from 'node:url';
// Uso: node src/cli.js --chat <JID> [--desde 2026-11-02] [--hasta 2026-11-09]
// Lee del almacén local y muestra el resumen en la terminal.
import { Almacen } from './almacen.js';
import { resumir } from './resumen.js';

function leerArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const a = leerArgs(argv);
  const chats = (env.CHATS_PERMITIDOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!a.chat) throw new Error('Falta --chat <JID>');
  if (!env.GEMINI_API_KEY) throw new Error('Define GEMINI_API_KEY');

  const almacen = new Almacen({ dir: env.DATOS_DIR ?? './datos', chatsPermitidos: chats });
  const mensajes = await almacen.leer({
    chat: a.chat,
    desde: a.desde ? new Date(a.desde).toISOString() : undefined,
    hasta: a.hasta ? new Date(`${a.hasta}T23:59:59.999`).toISOString() : undefined,
  });
  const texto = await resumir({ mensajes, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  return texto;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((t) => console.log(t)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
