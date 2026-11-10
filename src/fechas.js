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
