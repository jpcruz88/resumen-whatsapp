// Recupera de WhatsApp una imagen o un audio que llegó antes de vigilar el chat, a petición de quien mira la
// conversación (botón "Cargar"). Se hace de una en una y con una pausa entre peticiones: pedirle muchos
// archivos seguidos a WhatsApp es justo lo que conviene evitar.
const AVISO = {
  imagen: 'La imagen ya no está disponible en WhatsApp. Puede que se haya borrado de sus servidores o que el teléfono no haya respondido.',
  audio: 'El audio ya no está disponible en WhatsApp. Puede que se haya borrado de sus servidores o que el teléfono no haya respondido.',
};

export function crearRecuperacion({ almacen, vigilados, evolution, pausaMs = 500 }) {
  const enCurso = new Map(); // misma imagen pedida dos veces a la vez: una sola consulta
  let cola = Promise.resolve();

  async function ejecutar(m) {
    try {
      const { buffer, mimetype } = await evolution.recuperarMedia({
        chat: m.chat, id: m.id, propio: m.propio === true, autor: m.autor, tipo: m.tipo, medio: m.medio,
      });
      const ruta = await almacen.guardarMedio({ chat: m.chat, mediaId: m.mediaId, mimetype: m.mimetype || mimetype, buffer });
      if (!ruta) throw new Error('chat no vigilado');
      return { estado: 200, cuerpo: { ok: true, url: `/medios/${encodeURIComponent(m.mediaId)}` } };
    } catch (e) {
      // Solo el motivo de Evolution (sin contenido de mensajes); a quien mira se le da un aviso claro.
      console.error('recuperación de medio fallida', m.mediaId, String(e.message).slice(0, 200));
      return { estado: 502, cuerpo: { error: AVISO[m.tipo] ?? AVISO.imagen } };
    }
  }

  return async function recuperar({ cuerpo }) {
    const { chat, id } = cuerpo ?? {};
    if (typeof chat !== 'string' || typeof id !== 'string' || !chat || !id) {
      return { estado: 400, cuerpo: { error: 'Se requieren el chat y el mensaje' } };
    }
    // Primero el rechazo: antes de leer nada.
    if (!(await vigilados.esVigilado(chat))) return { estado: 403, cuerpo: { error: 'chat no vigilado' } };
    const m = await almacen.buscarMensaje({ chat, id });
    if (!m || (m.tipo !== 'imagen' && m.tipo !== 'audio')) return { estado: 404, cuerpo: { error: 'mensaje no encontrado' } };
    if (await almacen.localizarMedio({ mediaId: m.mediaId, mimetype: m.mimetype })) {
      return { estado: 200, cuerpo: { ok: true, url: `/medios/${encodeURIComponent(m.mediaId)}` } };
    }
    if (!m.medio) return { estado: 409, cuerpo: { error: 'De este mensaje no se guardaron los datos para pedirlo a WhatsApp.' } };

    const clave = `${chat}|${id}`;
    if (!enCurso.has(clave)) {
      const tarea = cola.then(() => ejecutar(m)).finally(() => enCurso.delete(clave));
      cola = tarea.then(() => new Promise((r) => setTimeout(r, pausaMs)));
      enCurso.set(clave, tarea);
    }
    return enCurso.get(clave);
  };
}
