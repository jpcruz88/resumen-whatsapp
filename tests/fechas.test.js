import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inicioDelDia, finDelDia } from '../src/fechas.js';
import { crearPanel } from '../src/panel.js';
import { Almacen } from '../src/almacen.js';
import { Vigilados } from '../src/vigilados.js';
import { main } from '../src/cli.js';

test('inicioDelDia y finDelDia interpretan AAAA-MM-DD en hora local', () => {
  assert.equal(inicioDelDia('2026-11-09'), new Date(2026, 10, 9, 0, 0, 0, 0).toISOString());
  assert.equal(finDelDia('2026-11-09'), new Date(2026, 10, 9, 23, 59, 59, 999).toISOString());
});

test('panel: desde = hasta = un dia incluye un mensaje de las 23:00 locales', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fechas-'));
  try {
    const JID = 'c@s.whatsapp.net';
    const vigilados = new Vigilados({ archivo: join(dir, 'v.json') });
    await vigilados.activar(JID);
    const almacen = new Almacen({ dir, vigilados });
    const msg = (id, d) => ({ id, chat: JID, tipo: 'texto', texto: id, propio: false, fecha: d.toISOString() });
    await almacen.guardar(msg('antes', new Date(2026, 10, 8, 23, 59)));
    await almacen.guardar(msg('madrugada', new Date(2026, 10, 9, 0, 1)));
    await almacen.guardar(msg('noche', new Date(2026, 10, 9, 23, 0)));
    await almacen.guardar(msg('despues', new Date(2026, 10, 10, 0, 1)));
    let leidos;
    const panel = crearPanel({
      almacen,
      evolution: { listarChats: async () => [] },
      generar: async ({ chat, desde, hasta }) => {
        leidos = (await almacen.leer({ chat, desde, hasta })).map((m) => m.id);
        return { url: '/reportes/x' };
      },
    });
    const r = await panel({ metodo: 'POST', ruta: '/resumen', cuerpo: { chat: JID, desde: '2026-11-09', hasta: '2026-11-09' } });
    assert.equal(r.estado, 200);
    assert.deepEqual(leidos, ['madrugada', 'noche']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cli: --desde y --hasta usan el mismo helper de dia local', async () => {
  const llamadas = [];
  await main(
    ['--chat', 'x@s.whatsapp.net', '--desde', '2026-11-09', '--hasta', '2026-11-09'],
    { SECRETO_WEBHOOK: 's', GEMINI_API_KEY: 'g', EVOLUTION_API_URL: 'http://e', EVOLUTION_API_KEY: 'k', EVOLUTION_INSTANCE: 'i', DATOS_DIR: await mkdtemp(join(tmpdir(), 'cli-f-')) },
    { generarReporte: async (a) => { llamadas.push(a); return { id: 'a-1' }; } },
  );
  assert.equal(llamadas[0].desde, inicioDelDia('2026-11-09'));
  assert.equal(llamadas[0].hasta, finDelDia('2026-11-09'));
});
