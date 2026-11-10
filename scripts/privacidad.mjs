// Revisión de privacidad: los datos de prueba deben ser inventados. Un identificador real de WhatsApp (de una
// persona, un grupo o un teléfono) mide 12 dígitos o más; solo se admiten los inventados que usan las pruebas.
const INVENTADOS = [
  /^5215511111111$/, /^5215522222222$/, /^5215533333333$/, /^5215599999999$/, /^5215512345678$/,
  /^1{15}$/, /^2{15}$/,
  /^90000000000000\d$/,
  /^1000000000000\d{2}$/,
  /^12036300000000000\d$/,
  /^555123456789$/, /^120363000000$/, // inventados en pruebas de nombres y de grupos
];

// Números de 12 o más dígitos que no están en la lista de inventados.
export function sospechosos(texto) {
  const largos = String(texto).match(/\d{12,}/g) ?? [];
  return [...new Set(largos)].filter((n) => !INVENTADOS.some((patron) => patron.test(n)));
}
