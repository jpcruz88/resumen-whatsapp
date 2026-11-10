// Fechas de calendario (AAAA-MM-DD) interpretadas en hora LOCAL, no UTC.
function partes(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
  if (!m) throw new Error(`fecha inválida (se espera AAAA-MM-DD): ${fecha}`);
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}

export function inicioDelDia(fecha) {
  const [a, m, d] = partes(fecha);
  return new Date(a, m, d, 0, 0, 0, 0).toISOString();
}

export function finDelDia(fecha) {
  const [a, m, d] = partes(fecha);
  return new Date(a, m, d, 23, 59, 59, 999).toISOString();
}

// Marca de tiempo en hora LOCAL como `AAAA-MM-DD HH:MM`. Si no es una fecha válida, devuelve el texto tal cual.
export function formatoLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const valida = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Periodo en español y en hora local: "lunes 9 de noviembre de 2026" o "3 de noviembre al 9 de noviembre de 2026".
export function etiquetaPeriodo(desde, hasta) {
  const a = valida(desde);
  const b = valida(hasta);
  if (!a || !b) return desde === undefined && hasta === undefined ? '' : `${desde ?? ''} a ${hasta ?? ''}`;
  if (mismoDia(a, b)) return `${DIAS[a.getDay()]} ${a.getDate()} de ${MESES[a.getMonth()]} de ${a.getFullYear()}`;
  const larga = (d, conAnio) => `${d.getDate()} de ${MESES[d.getMonth()]}${conAnio ? ` de ${d.getFullYear()}` : ''}`;
  const mismoAnio = a.getFullYear() === b.getFullYear();
  return `${larga(a, !mismoAnio)} al ${larga(b, true)}`;
}

// "9 de noviembre de 2026, 19:56" en hora local. Si no es una fecha válida, devuelve el texto tal cual.
export function fechaHoraLarga(iso) {
  const d = valida(iso);
  if (!d) return String(iso ?? '');
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
