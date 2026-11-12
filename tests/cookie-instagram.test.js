import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extraerCookie, guardarCookie } from '../src/cookie-instagram.js';

// Cookie inventada: no es de nadie.
const FALSA = 'datr=AAAA; csrftoken=falso123; ds_user_id=1; sessionid=1%3Afalsa%3A19; rur="RMN\\0541\\0541825986383:01ff"';
const CURL_B = `curl --url 'https://www.instagram.com/api/graphql' \\\n  -H 'accept: */*' \\\n  -b '${FALSA}' \\\n  -H 'origin: https://www.instagram.com'`;
const CURL_COOKIE_H = `curl 'https://www.instagram.com/x' -H 'cookie: ${FALSA}' -H 'accept: */*'`;
const CURL_DOBLE = `curl 'https://www.instagram.com/x' --cookie "datr=AAAA; sessionid=1%3Afalsa%3A19"`;

test('extrae la cookie de la opción -b', () => {
  assert.equal(extraerCookie(CURL_B), FALSA);
});

test('extrae la cookie de un encabezado cookie:', () => {
  assert.equal(extraerCookie(CURL_COOKIE_H), FALSA);
});

test('extrae la cookie de --cookie con comillas dobles', () => {
  assert.equal(extraerCookie(CURL_DOBLE), 'datr=AAAA; sessionid=1%3Afalsa%3A19');
});

test('sin cookie o sin sessionid devuelve null', () => {
  assert.equal(extraerCookie("curl 'https://x' -H 'accept: */*'"), null);
  assert.equal(extraerCookie("curl 'https://x' -b 'datr=AAAA'"), null);
});

test('guardarCookie escribe la variable, borra el curl y no devuelve el valor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cookie-'));
  try {
    const curl = join(dir, 'curl.txt'), env = join(dir, '.env');
    await writeFile(curl, CURL_B);
    await writeFile(env, 'OTRA=1\nINSTAGRAM_COOKIE=vieja\nFIN=2\n');
    const r = await guardarCookie({ archivoCurl: curl, archivoEnv: env });
    assert.deepEqual(Object.keys(r).sort(), ['campos', 'ok']);
    assert.equal(r.ok, true);
    assert.ok(!JSON.stringify(r).includes('falsa'));
    const txt = await readFile(env, 'utf8');
    assert.equal(txt, `OTRA=1\nFIN=2\nINSTAGRAM_COOKIE=${FALSA}\n`);
    await assert.rejects(access(curl));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('si el curl no trae cookie válida no toca el .env ni borra el curl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cookie-'));
  try {
    const curl = join(dir, 'curl.txt'), env = join(dir, '.env');
    await writeFile(curl, "curl 'https://x' -H 'accept: */*'");
    await writeFile(env, 'A=1\n');
    const r = await guardarCookie({ archivoCurl: curl, archivoEnv: env });
    assert.equal(r.ok, false);
    assert.equal(await readFile(env, 'utf8'), 'A=1\n');
    await access(curl);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('guardarCookie acepta el texto directo (portapapeles) y no borra nada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cookie-'));
  try {
    const env = join(dir, '.env');
    const r = await guardarCookie({ texto: CURL_B, archivoEnv: env });
    assert.equal(r.ok, true);
    assert.equal(await readFile(env, 'utf8'), `INSTAGRAM_COOKIE=${FALSA}\n`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
