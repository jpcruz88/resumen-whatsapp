// Nombres de las personas. El historial que manda WhatsApp trae, de quien no está en la agenda del mensaje,
// su número interno (por ejemplo 100000000000001@lid) en lugar del nombre. Los nombres sí se conocen por la
// lista de contactos de Evolution: aquí se resuelven al mostrar un mensaje o al armar un resumen, sin tocar
// lo que está guardado.
const SOLO_NUMERO = /^\d{6,}$/;
const esNombre = (n) => typeof n === 'string' && n.trim() !== '' && !SOLO_NUMERO.test(n.trim());

// mapa: Map de jid (número o @lid) -> nombre. Puede faltar si Evolution no responde.
export function nombreMostrable(m, mapa) {
  if (m.propio) return m.nombre || 'Yo';
  const delMapa = m.autor ? mapa?.get(m.autor) : undefined;
  if (esNombre(delMapa)) return delMapa;
  if (esNombre(m.nombre)) return m.nombre;
  const id = String(m.autor || m.nombre || '').split('@')[0];
  return id ? `Contacto sin nombre (…${id.slice(-4)})` : 'Alguien del grupo';
}

// "@100000000000001" dentro de un texto es una mención: si se sabe de quién es, pasa a "@Nombre".
export function resolverMenciones(texto, mapa) {
  if (typeof texto !== 'string' || !mapa) return texto;
  return texto.replace(/@(\d{8,})/g, (entero, digitos) => {
    const nombre = mapa.get(`${digitos}@lid`) ?? mapa.get(`${digitos}@s.whatsapp.net`);
    return esNombre(nombre) ? `@${nombre}` : entero;
  });
}

// Copias de los mensajes con el nombre de quien escribió y las menciones resueltos.
export function conNombres(mensajes, mapa) {
  return mensajes.map((m) => ({
    ...m,
    nombre: nombreMostrable(m, mapa),
    texto: resolverMenciones(m.texto, mapa),
  }));
}
