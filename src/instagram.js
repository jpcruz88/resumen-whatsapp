// Lee los mensajes directos de Instagram con la cookie de sesión del usuario y los guarda en el mismo almacén
// que los de WhatsApp. Solo lectura: nunca envía ni marca nada como visto. Es acceso no oficial, así que va
// despacio, con pausas, y se detiene a la primera señal de sesión vencida, verificación o límite.
// Nunca imprime ni incluye la cookie en errores o registros.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://i.instagram.com/api/v1/direct_v2';
const APP_ID = '936619743392459';
const AGENTE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

export class ErrorInstagram extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorInstagram';
    this.codigo = codigo; // 'sesion' | 'limite' | 'otro'
  }
}

function clasificar(estado, cuerpo) {
  const msg = String(cuerpo?.message ?? '').toLowerCase();
  if (/login_required|checkpoint|challenge|consent_required/.test(msg) || estado === 401 || estado === 403) {
    return new ErrorInstagram('sesion', `Instagram pidió iniciar sesión o verificar la cuenta (HTTP ${estado})`);
  }
  if (estado === 429 || /wait a few minutes|feedback_required|spam|rate/.test(msg)) {
    return new ErrorInstagram('limite', `Instagram pidió esperar (HTTP ${estado})`);
  }
  // Solo el texto corto y simple del mensaje de Instagram: ayuda a diagnosticar y no puede traer la cookie.
  const motivo = String(cuerpo?.message ?? '').replace(/[^\p{L}\p{N} _.,:-]/gu, '').slice(0, 80);
  return new ErrorInstagram('otro', `Instagram respondió HTTP ${estado}${motivo ? `: ${motivo}` : ''}`);
}

export function crearClienteInstagram({ cookie, fetchFn = fetch }) {
  const csrf = /(?:^|;\s*)csrftoken=([^;]*)/.exec(cookie ?? '')?.[1];
  if (!/(?:^|;\s*)sessionid=/.test(cookie ?? '') || !csrf) throw new Error('INSTAGRAM_COOKIE debe traer sessionid y csrftoken');
  const cabeceras = {
    accept: '*/*',
    'accept-language': 'es-419,es;q=0.9,en;q=0.8',
    cookie,
    'user-agent': AGENTE,
    referer: 'https://www.instagram.com/direct/inbox/',
    'x-csrftoken': csrf,
    'x-ig-app-id': APP_ID,
    'x-requested-with': 'XMLHttpRequest',
  };

  async function pedir(url) {
    let r;
    try {
      r = await fetchFn(url, { method: 'GET', headers: cabeceras, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new ErrorInstagram('otro', 'No se pudo conectar con Instagram');
    }
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* sin JSON */ }
    if (!r.ok || cuerpo?.status === 'fail') throw clasificar(r.status, cuerpo);
    return cuerpo ?? {};
  }

  return {
    async bandeja({ cursor } = {}) {
      const c = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const d = await pedir(`${BASE}/inbox/?persistentBadging=true&limit=20&thread_message_limit=20${c}`);
      return { yo: String(d.viewer?.pk ?? ''), hilos: d.inbox?.threads ?? [], hayMas: Boolean(d.inbox?.has_older), cursor: d.inbox?.oldest_cursor ?? null };
    },
    async hilo(id, { cursor } = {}) {
      const c = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const d = await pedir(`${BASE}/threads/${encodeURIComponent(id)}/?limit=20${c}`);
      return { hilo: d.thread ?? {}, hayMas: Boolean(d.thread?.has_older), cursor: d.thread?.oldest_cursor ?? null };
    },
  };
}

const nombreDeUsuario = (u) => (u?.full_name || u?.username || '').trim();

export function nombreDeHilo(h) {
  if (h.is_group) return (h.thread_title || '').trim() || 'Grupo de Instagram';
  return nombreDeUsuario(h.users?.[0]) || (h.thread_title || '').trim() || 'Instagram sin nombre';
}

function textoDe(it) {
  const t = it.text ?? it.link?.text ?? it.reel_share?.text ?? null;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

// Un hilo de Instagram -> mensajes en el formato del almacén. Solo texto: fotos, notas de voz y reacciones no se guardan.
export function parsearHilo(h, yo) {
  const chat = `ig:${h.thread_id}`;
  const usuarios = new Map((h.users ?? []).map((u) => [String(u.pk), nombreDeUsuario(u)]));
  const salida = [];
  for (const it of h.items ?? []) {
    const texto = textoDe(it);
    if (!texto || !['text', 'link', 'reel_share'].includes(it.item_type)) continue;
    const propio = String(it.user_id) === String(yo ?? h.viewer_id);
    const m = {
      id: `ig-${it.item_id}`,
      chat,
      chatAlt: null,
      propio,
      nombre: propio ? 'Yo' : usuarios.get(String(it.user_id)) || '',
      tipo: 'texto',
      texto,
      mediaId: null,
      mimetype: null,
      fecha: new Date(Number(it.timestamp) / 1000).toISOString(),
    };
    if (h.is_group) {
      m.esGrupo = true;
      m.autor = `ig:${it.user_id}`;
    }
    salida.push(m);
  }
  return salida;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const pausaPorDefecto = () => dormir(3000 + Math.random() * 5000);

async function guardarNombres(dir, nuevos) {
  if (Object.keys(nuevos).length === 0) return;
  const ruta = join(dir, 'instagram-nombres.json');
  let actual = {};
  try { actual = JSON.parse(await readFile(ruta, 'utf8')); } catch { /* primera vez */ }
  await mkdir(dir, { recursive: true });
  await writeFile(`${ruta}.tmp`, JSON.stringify({ ...actual, ...nuevos }));
  await rename(`${ruta}.tmp`, ruta);
}

export async function leerNombresInstagram(dir) {
  try { return Object.entries(JSON.parse(await readFile(join(dir, 'instagram-nombres.json'), 'utf8'))); } catch { return []; }
}

// Una pasada: guarda lo de la bandeja y, de los hilos con mensajes nuevos, baja páginas viejas hasta
// encontrar mensajes ya guardados o llegar al tope. Devuelve { nuevos, detenido }; detenido = 'sesion' | 'limite' | 'otro' | null.
export async function sincronizar({ cliente, almacen, dir, paginasMax = 10, hilosMax = 40, pausa = pausaPorDefecto }) {
  const total = { nuevos: 0, detenido: null };
  const nombres = {};
  try {
    const { yo, hilos } = await cliente.bandeja();
    const pendientes = [];
    for (const h of hilos.slice(0, hilosMax)) {
      if (!h?.thread_id) continue;
      nombres[`ig:${h.thread_id}`] = nombreDeHilo(h);
      const n = await almacen.guardarLote(parsearHilo(h, yo));
      total.nuevos += n;
      if (n > 0 && h.has_older) pendientes.push({ id: h.thread_id, cursor: h.oldest_cursor });
    }
    await guardarNombres(dir, nombres);
    for (const p of pendientes) {
      let cursor = p.cursor;
      for (let i = 0; i < paginasMax && cursor; i++) {
        await pausa();
        const r = await cliente.hilo(p.id, { cursor });
        const n = await almacen.guardarLote(parsearHilo(r.hilo, yo));
        total.nuevos += n;
        if (n === 0 || !r.hayMas) break;
        cursor = r.cursor;
      }
    }
  } catch (e) {
    if (!(e instanceof ErrorInstagram)) throw e;
    total.detenido = e.codigo;
    total.mensaje = e.message;
  }
  return total;
}

// Repite la pasada cada `intervaloMs` (con variación). Si la sesión falla deja de intentar: reintentar con una
// sesión inválida es lo que hace que Instagram bloquee. Con 'limite' espera una hora.
export function iniciarInstagram({ cliente, almacen, dir, intervaloMs = 15 * 60 * 1000, paginasMax, log = console.log, primeraEsperaMs = 30_000 }) {
  let temporizador;
  let parado = false;
  const programar = (ms) => { if (!parado) temporizador = setTimeout(correr, ms); };
  async function correr() {
    let siguiente = intervaloMs * (0.8 + Math.random() * 0.4);
    try {
      const r = await sincronizar({ cliente, almacen, dir, paginasMax });
      if (r.nuevos > 0) log('instagram: mensajes nuevos', r.nuevos);
      if (r.detenido === 'sesion') { log('instagram: la cookie venció o Instagram pidió verificar la cuenta; no se reintenta hasta reiniciar'); return; }
      if (r.detenido === 'limite') { log('instagram: Instagram pidió esperar; se reintenta en una hora'); siguiente = 60 * 60 * 1000; }
      else if (r.detenido) { log('instagram:', r.mensaje, '- no se reintenta hasta reiniciar'); return; }
    } catch {
      log('instagram: error inesperado al sincronizar');
    }
    programar(siguiente);
  }
  programar(primeraEsperaMs);
  return () => { parado = true; clearTimeout(temporizador); };
}
