import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { crearServidorHttp } from '../src/servidor.js';

async function conServidor(maxCuerpo, fn) {
  let llamadas = 0;
  const manejar = async () => {
    llamadas++;
    return { estado: 200, cuerpo: { ok: true } };
  };
  const servidor = crearServidorHttp({ manejar, maxCuerpo });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();
  try {
    await fn(port, () => llamadas);
  } finally {
    servidor.closeAllConnections?.();
    await new Promise((r) => servidor.close(r));
  }
}

function enviar(port, cuerpo, cabeceras = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: 'POST', path: '/webhook/evolution', headers: { 'content-type': 'application/json', ...cabeceras } },
      (res) => {
        let t = '';
        res.on('data', (c) => (t += c));
        res.on('end', () => resolve({ estado: res.statusCode, texto: t }));
      },
    );
    req.on('error', reject);
    req.end(cuerpo);
  });
}

test('cuerpo normal sigue devolviendo 200', async () => {
  await conServidor(1024, async (port, llamadas) => {
    const r = await enviar(port, JSON.stringify({ a: 1 }));
    assert.equal(r.estado, 200);
    assert.equal(llamadas(), 1);
  });
});

test('cuerpo mayor al tope devuelve 413 sin llamar al manejador', async () => {
  await conServidor(1024, async (port, llamadas) => {
    const r = await enviar(port, JSON.stringify({ x: 'a'.repeat(5000) }));
    assert.equal(r.estado, 413);
    assert.equal(llamadas(), 0);
  });
});

test('content-length declarado sobre el tope devuelve 413 sin leer ni llamar al manejador', async () => {
  await conServidor(1024, async (port, llamadas) => {
    const r = await enviar(port, '{}', { 'content-length': '999999' }).catch((e) => ({ error: e }));
    // El servidor responde sin esperar el cuerpo declarado.
    assert.equal(r.estado, 413);
    assert.match(r.texto, /cuerpo demasiado grande/);
    assert.equal(llamadas(), 0);
  });
});
