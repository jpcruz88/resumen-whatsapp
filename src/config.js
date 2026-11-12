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
  return {
    puerto,
    datosDir: env.DATOS_DIR || './datos',
    secreto: env.SECRETO_WEBHOOK,
    geminiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    panelHosts: lista(env.PANEL_HOSTS),
    // La cookie de Instagram es opcional (sirve para bajar videos). La lectura en vivo de mensajes está apagada
    // salvo INSTAGRAM_LECTURA=1: Instagram ya no la permite por la web.
    instagram: env.INSTAGRAM_COOKIE ? { cookie: env.INSTAGRAM_COOKIE, paginasMax: Number(env.INSTAGRAM_PAGINAS) || 10, enVivo: env.INSTAGRAM_LECTURA === '1' } : null,
    evolution: {
      url: env.EVOLUTION_API_URL,
      apiKey: env.EVOLUTION_API_KEY,
      instancia: env.EVOLUTION_INSTANCE,
    },
  };
}
