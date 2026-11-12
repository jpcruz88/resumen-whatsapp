#!/usr/bin/env node
// Uso: node scripts/importar-instagram.mjs <carpeta de la exportación> [--yo "Tu nombre en Instagram"]
// Importa los mensajes de la exportación oficial de Instagram (JSON) al almacén. Se puede repetir con una
// exportación nueva: no duplica. Solo muestra cantidades, nunca el contenido.
import { importar } from '../src/importar-instagram.js';
import { Almacen } from '../src/almacen.js';
import { TodosLosChats } from '../src/vigilados.js';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const i = args.indexOf('--yo');
const yo = i >= 0 ? args[i + 1] : undefined;
const carpeta = args.find((a, k) => !a.startsWith('--') && k !== i + 1);
if (!carpeta) { console.error('Uso: node scripts/importar-instagram.mjs <carpeta de la exportación> [--yo "Tu nombre"]'); process.exit(1); }

const dir = resolve(process.env.DATOS_DIR || './datos');
const almacen = new Almacen({ dir, vigilados: new TodosLosChats() });
const r = await importar({ carpeta: resolve(carpeta), almacen, dir, yo });
if (r.leidos === 0) { console.error('No encontré mensajes. Revisa que la carpeta sea la exportación en JSON con "Mensajes".'); process.exit(1); }
console.log(`Importado: ${r.nuevos} mensajes nuevos de ${r.leidos} leídos, en ${r.chats} chats.`);
console.log(r.yo ? `Tu nombre detectado: ${r.yo}` : 'No pude detectar cuál eres tú: repite con --yo "Tu nombre en Instagram" para marcar tus mensajes.');
