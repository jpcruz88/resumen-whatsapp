import { pathToFileURL } from 'node:url';
// Uso: node src/cli.js --chat <JID> [--desde 2026-11-02] [--hasta 2026-11-09]
// Genera el reporte y muestra su URL local. El chat debe estar vigilado.
import { join } from 'node:path';
import { Almacen } from './almacen.js';
import { Vigilados } from './vigilados.js';
import { leerConfig } from './config.js';
import { generarReporte as generarReal } from './reportar.js';
import { inicioDelDia, finDelDia } from './fechas.js';

function leerArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

export async function main(argv = process.argv.slice(2), env = process.env, { generarReporte = generarReal } = {}) {
  const a = leerArgs(argv);
  if (!a.chat) throw new Error('Falta --chat <JID>');
  const cfg = leerConfig(env);

  const vigilados = new Vigilados({ archivo: join(cfg.datosDir, 'vigilados.json') });
  const almacen = new Almacen({ dir: cfg.datosDir, vigilados });
  const { id } = await generarReporte({
    chat: a.chat,
    desde: a.desde ? inicioDelDia(a.desde) : undefined,
    hasta: a.hasta ? finDelDia(a.hasta) : undefined,
    almacen,
    vigilados,
    medios: { apiKey: cfg.geminiKey, model: cfg.geminiModel },
    dirReportes: join(cfg.datosDir, 'reportes'),
  });
  return `http://127.0.0.1:${cfg.puerto}/reportes/${id}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((u) => console.log(u)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
