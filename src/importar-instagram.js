// Importa la exportación oficial de Instagram ("Descargar tu información", formato JSON, solo Mensajes) al
// mismo almacén que WhatsApp. No usa la cuenta ni la red: solo lee archivos locales. Solo texto (también el
// de enlaces compartidos); fotos, audios y reacciones no se importan.
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { guardarNombres } from './instagram.js';

// Instagram guarda los textos como bytes UTF-8 leídos como latin1 ("ñ" sale "Ã±"): se deshace.
function arreglar(s) {
  if (typeof s !== 'string' || [...s].some((c) => c.charCodeAt(0) > 255)) return s;
  const d = Buffer.from(s, 'latin1').toString('utf8');
  return d.includes('�') ? s : d;
}

// Avisos que Instagram mete como "mensajes" y no son conversación.
const AVISO = /^(.+ sent an attachment\.|.+ envió un archivo adjunto\.|reacted .+ to your message|reaccionó .+ a tu mensaje|.*liked a message|le gustó un mensaje.*)$/i;

function textoDe(m) {
  const t = m.content ?? m.share?.share_text ?? null;
  const limpio = typeof t === 'string' ? arreglar(t).trim() : '';
  return limpio && !AVISO.test(limpio) ? limpio : null;
}

async function archivosDeMensajes(dir) {
  const salida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await archivosDeMensajes(ruta)));
    else if (/^message_\d+\.json$/.test(e.name)) salida.push(ruta);
  }
  return salida;
}

export async function leerExportacion(carpeta, { yo } = {}) {
  const hilos = new Map(); // carpeta del hilo -> { participantes, titulo, mensajes }
  let rutas;
  try { rutas = await archivosDeMensajes(carpeta); } catch { rutas = []; }
  for (const ruta of rutas.sort()) {
    let d;
    try { d = JSON.parse(await readFile(ruta, 'utf8')); } catch { continue; }
    const id = basename(join(ruta, '..'));
    const h = hilos.get(id) ?? { participantes: new Set(), titulo: '', mensajes: [] };
    for (const p of d.participants ?? []) if (p?.name) h.participantes.add(arreglar(p.name));
    if (d.title && !h.titulo) h.titulo = arreglar(d.title);
    h.mensajes.push(...(d.messages ?? []));
    hilos.set(id, h);
  }

  // Quién soy: el nombre que aparece en más conversaciones (yo estoy en todas). Con un solo hilo no se puede saber.
  if (!yo && hilos.size > 1) {
    const cuenta = new Map();
    for (const h of hilos.values()) for (const n of h.participantes) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
    const [[nombre, veces] = []] = [...cuenta].sort((a, b) => b[1] - a[1]);
    if (nombre && veces === hilos.size) yo = nombre;
  }

  const mensajes = [];
  const nombres = {};
  for (const [id, h] of hilos) {
    const chat = `ig:${id}`;
    const esGrupo = h.participantes.size > 2;
    const otro = [...h.participantes].find((n) => n !== yo);
    nombres[chat] = h.titulo || (esGrupo ? 'Grupo de Instagram' : otro) || 'Instagram sin nombre';
    for (const m of h.mensajes) {
      const texto = textoDe(m);
      if (!texto || !m.timestamp_ms) continue;
      const emisor = arreglar(m.sender_name ?? '');
      const propio = Boolean(yo) && emisor === yo;
      const r = {
        id: `ig-exp-${createHash('sha1').update(`${id}|${m.timestamp_ms}|${emisor}|${texto}`).digest('hex').slice(0, 16)}`,
        chat,
        chatAlt: null,
        propio,
        nombre: propio ? 'Yo' : emisor,
        tipo: 'texto',
        texto,
        mediaId: null,
        mimetype: null,
        fecha: new Date(Number(m.timestamp_ms)).toISOString(),
      };
      if (esGrupo) { r.esGrupo = true; r.autor = `ig:${emisor}`; }
      mensajes.push(r);
    }
  }
  return { yo: yo ?? null, mensajes, nombres };
}

export async function importar({ carpeta, almacen, dir, yo }) {
  const r = await leerExportacion(carpeta, { yo });
  const nuevos = await almacen.guardarLote(r.mensajes);
  await guardarNombres(dir, r.nombres);
  return { nuevos, leidos: r.mensajes.length, chats: Object.keys(r.nombres).length, yo: r.yo };
}
