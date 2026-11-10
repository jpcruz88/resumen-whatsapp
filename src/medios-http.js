// Sirve las imágenes y los audios guardados de los chats vigilados. La ruta solo acepta ids simples
// (nunca nombres de archivo) y el tipo sale de la lista de abajo, no del nombre ni del contenido.
import { mkdir, rename, rm, access } from 'node:fs/promises';
import { join } from 'node:path';

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const TIPOS = {
  'audio/ogg': 'audio/ogg',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};
const no = () => ({ estado: 404, cuerpo: { error: 'no encontrado' } });
const existe = (ruta) => access(ruta).then(() => true, () => false);

export function crearMedios({ almacen, convertir }) {
  const convirtiendo = new Map(); // un solo ffmpeg por audio aunque lo pidan varias veces a la vez

  async function aM4a(id, origen) {
    const carpeta = join(almacen.dir, 'media', 'conv');
    const final = join(carpeta, `${id}.m4a`);
    if (await existe(final)) return final;
    if (!convertir) return null;
    if (!convirtiendo.has(id)) {
      const trabajo = (async () => {
        await mkdir(carpeta, { recursive: true });
        const parcial = join(carpeta, `${id}.parcial.m4a`);
        try {
          await convertir(origen, parcial);
          await rename(parcial, final);
          return final;
        } catch {
          await rm(parcial, { force: true }); // nunca queda un archivo a medias
          return null;
        }
      })().finally(() => convirtiendo.delete(id));
      convirtiendo.set(id, trabajo);
    }
    return convirtiendo.get(id);
  }

  return async function medios({ metodo, ruta }) {
    if (metodo !== 'GET') return no();
    const m = /^\/medios\/([^/]+?)(\.m4a)?$/.exec(String(ruta).split('?')[0]);
    if (!m) return no();
    let id;
    try { id = decodeURIComponent(m[1]); } catch { return no(); }
    if (!ID.test(id)) return no();
    const hallado = await almacen.localizarMedio({ mediaId: id });
    const tipo = hallado && TIPOS[hallado.mimetype];
    if (!tipo) return no();
    if (!m[2]) return { estado: 200, archivo: { ruta: hallado.ruta, tipo } };
    if (tipo !== 'audio/ogg') return no();
    const m4a = await aM4a(id, hallado.ruta);
    return m4a ? { estado: 200, archivo: { ruta: m4a, tipo: 'audio/mp4' } } : no();
  };
}
