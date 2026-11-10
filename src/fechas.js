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
