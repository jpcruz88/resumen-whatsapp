// Lee y valida la configuración del entorno. Los errores nombran la variable.
// Nunca imprime ni devuelve en errores los valores de las claves.
const lista = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function leerConfig(env = process.env) {
  for (const nombre of [
    'SECRETO_WEBHOOK',
    'GEMINI_API_KEY',
    'EVOLUTION_API_URL',
    'EVOLUTION_API_KEY',
    'EVOLUTION_INSTANCE',
  ]) {
    if (!env[nombre]) throw new Error(`Define ${nombre}`);
  }
  const puerto = Number(env.PUERTO ?? 3100);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error('PUERTO debe ser un entero entre 1 y 65535');
  }
  // 0 (o sin definir) = el buzón se conserva siempre.
  const buzonDias = Number(env.BUZON_DIAS ?? 0);
  if (!Number.isInteger(buzonDias) || buzonDias < 0) throw new Error('BUZON_DIAS debe ser un entero: 0 para conservar siempre');
  return {
    puerto,
    datosDir: env.DATOS_DIR || './datos',
    secreto: env.SECRETO_WEBHOOK,
    geminiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    panelHosts: lista(env.PANEL_HOSTS),
    buzonDias,
    evolution: {
      url: env.EVOLUTION_API_URL,
      apiKey: env.EVOLUTION_API_KEY,
      instancia: env.EVOLUTION_INSTANCE,
    },
  };
}
