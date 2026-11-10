import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { crearManejador } from '../src/servidor.js';
import { parsearEventoEvolution } from '../src/parse.js';
import { construirPrompt } from '../src/resumen.js';

const GRUPO = '120363000000000001@g.us';
const AUTOR = '5215511111111@s.whatsapp.net';

function eventoGrupo({ texto = 'hola equipo', id = 'G1', participant = AUTOR, pushName = 'Ana Beltrán', mensaje } = {}) {
  return {
    event: 'messages.upsert',
    instance: 'resumen',
    data: {
      key: { remoteJid: GRUPO, fromMe: false, id, participant },
      pushName,
      message: mensaje ?? { conversation: texto },
      messageTimestamp: 1762646400,
    },
  };
}

async function montar(vigilado) {
  const dir = await mkdtemp(join(tmpdir(), 'grupos-'));
  const v = new Vigilados({ archivo: join(dir, 'vigilados.json') });
  for (const j of [].concat(vigilado ?? [])) await v.activar(j);
  const almacen = new Almacen({ dir, vigilados: v });
  const manejar = crearManejador({ almacen, secreto: 'S', evolution: undefined });
  const enviar = (cuerpo) =>
    manejar({ metodo: 'POST', ruta: '/webhook/evolution', cabeceras: { apikey: 'S' }, cuerpo });
  return { dir, almacen, enviar };
}

test('parsear acepta un mensaje de grupo y guarda quién lo escribió', () => {
  const m = parsearEventoEvolution(eventoGrupo());
  assert.equal(m.chat, GRUPO);
  assert.equal(m.esGrupo, true);
  assert.equal(m.autor, AUTOR);
  assert.equal(m.nombre, 'Ana Beltrán');
  assert.equal(m.chatAlt, null);
});

test('un mensaje individual no lleva esGrupo ni autor', () => {
  const e = eventoGrupo();
  e.data.key.remoteJid = AUTOR;
  delete e.data.key.participant;
  const m = parsearEventoEvolution(e);
  assert.equal('esGrupo' in m, false);
  assert.equal('autor' in m, false);
});

test('el webhook guarda el mensaje de un grupo vigilado con su autor', async () => {
  const { dir, almacen, enviar } = await montar(GRUPO);
  try {
    const r = await enviar(eventoGrupo());
    assert.equal(r.estado, 200);
    const [m] = await almacen.leer({ chat: GRUPO });
    assert.equal(m.texto, 'hola equipo');
    assert.equal(m.nombre, 'Ana Beltrán');
    assert.equal(m.autor, AUTOR);
    assert.equal(m.esGrupo, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('un grupo que no está vigilado no escribe nada', async () => {
  const { dir, enviar } = await montar([]);
  try {
    await enviar(eventoGrupo());
    assert.deepEqual((await readdir(dir)).filter((f) => f !== 'vigilados.json'), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el audio de un grupo vigilado se guarda como medio', async () => {
  const { dir, enviar } = await montar(GRUPO);
  try {
    await enviar(eventoGrupo({
      id: 'GA1',
      mensaje: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' }, base64: Buffer.from('bytes').toString('base64') },
    }));
    assert.equal((await readdir(join(dir, 'media'))).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el prompt de un grupo nombra a quien escribe y avisa que es un grupo', () => {
  const p = construirPrompt([
    { fecha: '2026-11-09T15:00:00.000Z', propio: false, tipo: 'texto', texto: 'mándame la factura', esGrupo: true, nombre: 'Ana Beltrán' },
    { fecha: '2026-11-09T15:01:00.000Z', propio: true, tipo: 'texto', texto: 'listo', esGrupo: true, nombre: 'Yo' },
    { fecha: '2026-11-09T15:02:00.000Z', propio: false, tipo: 'texto', texto: 'gracias', esGrupo: true, nombre: '' },
  ]);
  assert.match(p, /Ana Beltrán: mándame la factura/);
  assert.match(p, /yo: listo/);
  assert.match(p, /alguien del grupo: gracias/);
  assert.match(p, /grupo/i);
  assert.ok(!p.includes('contacto:'));
});

test('el prompt de un chat individual no menciona grupos y sigue usando "contacto"', () => {
  const p = construirPrompt([{ fecha: '2026-11-09T15:00:00.000Z', propio: false, tipo: 'texto', texto: 'hola' }]);
  assert.match(p, /contacto: hola/);
  assert.ok(!/grupo/i.test(p));
});
