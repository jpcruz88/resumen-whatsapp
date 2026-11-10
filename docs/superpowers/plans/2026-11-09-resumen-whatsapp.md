# Resumen de chats de WhatsApp: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servicio local en la Mac que recibe mensajes de Evolution API (Docker), guarda texto, audios e imágenes de los chats vigilados, y genera por chat y periodo un reporte HTML con Trabajo (tareas y temas) y Personal, accesible por panel web detrás de Cloudflare Access.

**Architecture:** Un solo proceso Node sin dependencias. Módulos pequeños: parseo del webhook, lista de vigilados, almacén JSONL, cliente de Evolution, procesamiento de medios con Gemini, resumen, reporte HTML, panel. Cloudflare solo enruta (túnel) y autentica (Access); los datos se quedan en la Mac.

**Tech Stack:** Node 26 (ESM, `node:test`, `fetch`), Evolution API v2 en Docker, Gemini REST, cloudflared, Cloudflare Access.

**Spec:** `docs/superpowers/specs/2026-11-09-resumen-whatsapp-design.md`

## Global Constraints

- Sin dependencias npm; solo módulos de Node.
- Servidor escucha solo en `127.0.0.1`.
- Webhook exige cabecera `apikey` igual a `SECRETO_WEBHOOK` (comparación con `timingSafeEqual`).
- Solo se guardan chats marcados como vigilados. Lo demás se descarta sin escribir.
- Nunca enviar mensajes a WhatsApp.
- Datos (`DATOS_DIR`, `reportes/`) fuera de git (`.gitignore`).
- Modelo: `GEMINI_MODEL`, por defecto `gemini-3.1-flash-lite`; se verifica en Task 4 que acepte audio e imagen.
- Cada tarea: prueba primero, verla fallar por la razón esperada, implementar, verla pasar, suite completa en verde, commit.

## Review Focus

1. Audio o imagen corrupta o vacía → el reporte marca "no se pudo procesar" y el resto del reporte se genera (no crashea).
2. Mensaje de tipo no soportado (video, documento, sticker) → se ignora sin error.
3. Texto de un mensaje con HTML o script → sale escapado en el reporte.
4. Petición de resumen de un chat no vigilado → rechazada, no se leen sus mensajes.
5. Evolution caído al bajar un medio → error claro en el reporte; el mensaje queda guardado sin medio, y el reintento no duplica.

## File Structure

- Create `src/vigilados.js`: lista de chats vigilados en JSON (activar, desactivar, consultar).
- Create `src/evolution.js`: cliente HTTP de Evolution (descargar medio, listar chats).
- Create `src/medios.js`: transcribir audio y describir imagen con Gemini; caché en `<archivo>.txt`.
- Create `src/reporte.js`: markdown del resumen → HTML escapado; guardar en `reportes/`.
- Create `src/panel.js`: páginas y acciones del panel (listar chats, marcar vigilados, pedir reporte).
- Modify `src/parse.js`: reconoce texto, audio e imagen; ignora el resto.
- Modify `src/almacen.js`: usa `Vigilados` en vez de `chatsPermitidos`; guarda medios.
- Modify `src/resumen.js`: prompt con transcripciones y descripciones; categorías del diseño; sin mapa de nombres.
- Modify `src/servidor.js`: rutas del panel además del webhook; arranque con la nueva configuración.
- Delete the `--chat` requirement in `src/cli.js` or keep the CLI for `--chat`/`--desde`/`--hasta` only (Task 9 decides: keep, one chat).
- Create `docker-compose.yml`, `docs/cloudflare.md` (pasos del túnel y Access).
- Tests: `tests/*.test.js` alongside each module.

---

### Task 1: Parseo de texto, audio e imagen

**Files:**
- Modify: `src/parse.js`
- Test: `tests/resumen.test.js` (sección parse)

**Interfaces:**
- Produces: `parsearEventoEvolution(payload) -> {id, chat, propio, nombre, tipo, texto, mediaId, mimetype, fecha} | null`.
  `tipo` es `'texto' | 'audio' | 'imagen'`. Para audio o imagen, `texto` es `null`, `mediaId` es `key.id` y `mimetype` viene de `audioMessage.mimetype` o `imageMessage.mimetype`. Otros tipos devuelven `null`.

- [ ] **Step 1: Write the failing test**

Add tests: audio (`message.audioMessage` con `mimetype: 'audio/ogg; codecs=opus'`) devuelve `tipo: 'audio'`, `mediaId: 'ID1'`, `texto: null`; imagen con `imageMessage` y `caption` "factura" devuelve `tipo: 'imagen'`, `texto: 'factura'`; `videoMessage` devuelve `null`; un `remoteJid` que termina en `@g.us` (grupo) devuelve `null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL en los tests nuevos (tipo no existe).

- [ ] **Step 3: Implement the parser**

Mismo punto de entrada. Ramas: `conversation`/`extendedTextMessage` → texto; `audioMessage` → audio; `imageMessage` → imagen (con `caption` como `texto` si existe); otro → `null`. Conservar el comportamiento de texto vacío y `messageTimestamp`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS (11 viejos + nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/parse.js tests/resumen.test.js
git commit -m "feat(parse): reconocer audio e imagen del webhook"
```

---

### Task 2: Lista de chats vigilados

**Files:**
- Create: `src/vigilados.js`
- Modify: `src/almacen.js`, `tests/resumen.test.js`
- Test: `tests/vigilados.test.js`

**Interfaces:**
- Produces: `class Vigilados { constructor({archivo}); async lista(): string[]; async activar(jid); async desactivar(jid); async esVigilado(jid): boolean }`. Archivo JSON `{ "chats": [...] }`; si no existe, lista vacía.
- Consumes: nada.
- Almacen: `new Almacen({dir, vigilados})`. `guardar` y `leer` consultan `await vigilados.esVigilado(chat)`.

- [ ] **Step 1: Write the failing test**

`activar` y luego `esVigilado` → true; `desactivar` → false; `activar` dos veces no duplica en `lista()`; archivo inexistente → `lista()` vacío.
Migrar los tests de `Almacen` de `chatsPermitidos` a `vigilados` (con `Vigilados` real sobre archivo temporal).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL (`Vigilados` no existe; Almacen espera `chatsPermitidos`).

- [ ] **Step 3: Implement**

`Vigilados` lee y escribe el JSON de forma síncrona por operación (pocas escrituras). `Almacen` reemplaza `this.permitidos` por `this.vigilados` y usa `esVigilado`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vigilados.js src/almacen.js tests/
git commit -m "feat(vigilados): lista de chats vigilados y almacén que la respeta"
```

---

### Task 3: Almacén de medios y cliente de Evolution

**Files:**
- Create: `src/evolution.js`
- Modify: `src/almacen.js` (método `guardarMedio`)
- Test: `tests/evolution.test.js`

**Interfaces:**
- Produces:
  - `crearClienteEvolution({url, apiKey, instancia, fetchFn = fetch}) -> {descargarMedia(mediaId, chat) -> {buffer, mimetype}, listarChats() -> [{jid, nombre}]}`.
    `descargarMedia` hace POST a `${url}/chat/getBase64FromMediaMessage/${instancia}` con cabecera `apikey`, cuerpo `{message: {key: {id: mediaId}}, convertToMp4: false}`, y decodifica `base64` de la respuesta. Error si la respuesta no es 2xx.
    `listarChats` hace POST a `${url}/chat/findChats/${instancia}` y mapea `{id, pushName}` a `{jid, nombre}`.
  - `Almacen.guardarMedio({chat, mediaId, mimetype, buffer}) -> ruta` escribe en `DATOS_DIR/media/<mediaId>.<ext>`. `ext` sale de `mimetype` (`ogg` para audio/ogg, `jpg`/`png`/`webp` para imagen).
- Consumes: nada.

- [ ] **Step 1: Write the failing test**

Fake `fetchFn` que devuelve `{base64: "..."}` → `descargarMedia` regresa el buffer decodificado. Respuesta 500 → lanza error con el status. `listarChats` mapea correctamente. `guardarMedio` crea el archivo con la extensión correcta.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implement**

Usar `fetchFn` inyectado. Mapa de extensiones pequeño dentro de `almacen.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evolution.js src/almacen.js tests/evolution.test.js
git commit -m "feat(evolution): descargar medios y listar chats"
```

---

### Task 4: Transcribir audio y describir imagen con Gemini

**Files:**
- Create: `src/medios.js`
- Test: `tests/medios.test.js`

**Interfaces:**
- Produces: `procesarMedio({tipo, ruta, mimetype, apiKey, model, fetchFn = fetch}) -> Promise<string>`.
  `tipo` es `'audio'` (transcribe, devuelve el texto) o `'imagen'` (devuelve una línea en español).
  Caché: si existe `<ruta>.txt`, devuelve su contenido sin llamar a Gemini. Si Gemini falla, lanza error `Error('no se pudo procesar el medio')` con `cause`.
- Consumes: archivo de `Almacen.guardarMedio`.

- [ ] **Step 1: Write the failing test**

Fake `fetchFn`: el cuerpo enviado contiene `inlineData` con `mimeType` igual al dado y `data` en base64; la respuesta se devuelve como texto. Segunda llamada con mismo `ruta` no llama a `fetchFn` (caché). Respuesta 400 → error con mensaje en español.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL.

- [ ] **Step 3: Implement**

Prompts: audio → "Transcribe este audio en español, tal cual. Si no se entiende, dilo."; imagen → "Describe esta imagen en una línea en español. Si contiene texto importante, cópialo." Escribir `<ruta>.txt` tras éxito.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Verify the model accepts audio and images**

Con `GEMINI_API_KEY` real, transcribir un audio corto de prueba y describir una imagen. Expected: texto coherente. Si el modelo rechaza audio, cambiar `GEMINI_MODEL` a uno que acepte audio y repetir. Registrar el modelo elegido en el README.

- [ ] **Step 6: Commit**

```bash
git add src/medios.js tests/medios.test.js README.md
git commit -m "feat(medios): transcribir audio y describir imagen con Gemini"
```

---

### Task 5: Resumen por chat y periodo

**Files:**
- Modify: `src/resumen.js`, `tests/resumen.test.js`

**Interfaces:**
- Produces:
  - `construirPrompt(mensajes) -> string`. Cada mensaje se muestra como `[fecha] yo|contacto: texto`. Audio e imagen usan su `textoMedia` (transcripción o descripción) si existe; si no, `[audio no procesado]`.
  - `resumir({mensajes, apiKey, model, fetchFn}) -> Promise<string>`: markdown con `## Trabajo`, `### Tareas que me pidieron`, `### Temas de trabajo`, `## Personal`. Si no hay mensajes, devuelve "No hay mensajes en ese periodo." sin llamar al modelo.
- Consumes: mensajes de `Almacen.leer`, con `textoMedia` ya puesto por el orquestador (Task 7).

- [ ] **Step 1: Write the failing test**

Prompt incluye la transcripción de un audio; un audio sin `textoMedia` aparece como `[audio no procesado]`; prompt pide las dos categorías y la lista de tareas con fecha.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL en los nuevos.

- [ ] **Step 3: Implement**

Cambiar `construirPrompt` para usar `textoMedia`. Mantener `resumir` y la prueba existente.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resumen.js tests/resumen.test.js
git commit -m "feat(resumen): incluir transcripciones de medios en el prompt"
```

---

### Task 6: Reporte HTML escapado

**Files:**
- Create: `src/reporte.js`
- Test: `tests/reporte.test.js`

**Interfaces:**
- Produces:
  - `markdownAHtml(md) -> string`: soporta `##`, `###`, listas `- `, párrafos. Escapa `& < > " '` antes de procesar.
  - `renderReporte({chat, nombre, desde, hasta, markdown}) -> string` (documento HTML completo, con `<meta charset="utf-8">` y `viewport`, CSS mínimo claro/oscuro con `prefers-color-scheme`).
  - `guardarReporte({dir, html}) -> id` escribe `dir/<id>.html`, id = hash corto de contenido + timestamp.
- Consumes: markdown de `resumir`.

- [ ] **Step 1: Write the failing test**

Markdown con `<script>alert(1)</script>` → el HTML contiene `&lt;script&gt;` y no contiene `<script>`. Listas y encabezados convertidos. `guardarReporte` devuelve id que existe como archivo.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL.

- [ ] **Step 3: Implement**

Parser de líneas simple. Sin librerías.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reporte.js tests/reporte.test.js
git commit -m "feat(reporte): HTML del resumen con escape de texto"
```

---

### Task 7: Orquestador: pedir un reporte

**Files:**
- Create: `src/reportar.js`
- Test: `tests/reportar.test.js`

**Interfaces:**
- Produces: `generarReporte({chat, desde, hasta, almacen, vigilados, medios: {apiKey, model, fetchFn}, dirReportes}) -> Promise<{id, url}>`.
  Flujo: si `!await vigilados.esVigilado(chat)` lanza `Error('chat no vigilado')`. Lee mensajes del periodo. Para cada audio o imagen procesa con `procesarMedio` (Task 4) y pone `textoMedia`. Si un medio falla, `textoMedia = 'no se pudo procesar'` y sigue. Llama `resumir`, `renderReporte`, `guardarReporte`. `url` es `/reportes/<id>`.
- Consumes: Tasks 2, 4, 5, 6.

- [ ] **Step 1: Write the failing test**

Chat no vigilado → rechaza sin llamar a Gemini. Chat vigilado con un audio que falla en Gemini → reporte se genera y dice "no se pudo procesar". Devuelve `url` con prefijo `/reportes/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL.

- [ ] **Step 3: Implement**

Conectar los módulos. No duplicar lógica de cada uno.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reportar.js tests/reportar.test.js
git commit -m "feat(reportar): orquestar medios, resumen y reporte por chat"
```

---

### Task 8: Panel web y rutas del servidor

**Files:**
- Create: `src/panel.js`
- Modify: `src/servidor.js`
- Test: `tests/panel.test.js`

**Interfaces:**
- Produces:
  - `crearPanel({vigilados, evolution, generar}) -> manejar({metodo, ruta, cuerpo}) -> {estado, html?, cuerpo?}`.
    - `GET /` → página con la lista de `evolution.listarChats()`, casilla por chat (marcada si vigilado) y formulario: chat, `desde`, `hasta`, botón "Generar resumen".
    - `POST /vigilar` con `{chat, activo}` → `vigilados.activar` o `desactivar`.
    - `POST /resumen` con `{chat, desde, hasta}` → `generar(...)`, responde `{url}`.
  - `crearManejador` (webhook) sigue igual; el router de `servidor.js` manda `/webhook/evolution` y `/resumen` (ahora GET se elimina) al webhook o al panel según ruta. `GET /reportes/:id` sirve el HTML guardado.
- Consumes: Tasks 2, 3, 6, 7.

- [ ] **Step 1: Write the failing test**

- `GET /` incluye el nombre de un chat y su JID escapado.
- `POST /vigilar` activa el chat y `esVigilado` da true.
- `POST /resumen` de chat no vigilado responde 403.
- `GET /reportes/<id>` devuelve el HTML guardado y 404 si el id no existe o tiene `..`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL.

- [ ] **Step 3: Implement**

Escapar nombres con `markdownAHtml`-style escape (función compartida de `reporte.js`). Validar id con `/^[a-f0-9-]+$/`. Quitar el `GET /resumen` viejo de `servidor.js` y su prueba, reemplazándola por la de `POST /resumen`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/panel.js src/servidor.js src/reporte.js tests/
git commit -m "feat(panel): listar chats, marcar vigilados y pedir reportes"
```

---

### Task 9: Arranque, CLI y Docker de Evolution

**Files:**
- Modify: `src/servidor.js` (arranque), `src/cli.js`, `.env.example`, `README.md`
- Create: `docker-compose.yml`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `leerConfig(env) -> {puerto, datosDir, secreto, geminiKey, geminiModel, evolution: {url, apiKey, instancia}}`. Lanza error con el nombre de la variable faltante. Variables: `SECRETO_WEBHOOK`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DATOS_DIR`, `PUERTO`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`. Se quita `CHATS_PERMITIDOS`.
- CLI: `node src/cli.js --chat <JID> --desde <fecha> --hasta <fecha>` llama `generarReporte` y muestra la URL local.

- [ ] **Step 1: Write the failing test**

`leerConfig` sin `SECRETO_WEBHOOK` lanza error que menciona la variable. Con todas, devuelve el objeto.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL.

- [ ] **Step 3: Implement**

`docker-compose.yml`: servicio `evolution-api` con imagen `evoapicloud/evolution-api` y volumen de instancias,, con puerto ligado a `127.0.0.1:8080`. Webhook de la instancia: `http://host.docker.internal:3100/webhook/evolution`, evento `MESSAGES_UPSERT`, cabecera `apikey` = `SECRETO_WEBHOOK`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Verify Evolution and webhook end to end**

Run: `docker compose up -d`, crear instancia, escanear QR, enviar un mensaje de texto y un audio desde otro teléfono a un chat vigilado. Expected: aparecen en `DATOS_DIR/<hash>.jsonl` y `DATOS_DIR/media/`. Sin logs de error en el servidor.

- [ ] **Step 6: Commit**

```bash
git add src/ docker-compose.yml .env.example README.md tests/config.test.js
git commit -m "feat(config): arranque con Evolution en Docker y variables nuevas"
```

---

### Task 10: Túnel de Cloudflare y acceso protegido

**Files:**
- Create: `docs/cloudflare.md`
- Modify: `README.md`

**Interfaces:**
- Produces: un hostname (por ejemplo `resumen.<dominio>`) que llega a `http://127.0.0.1:3100`, protegido por una aplicación de Cloudflare Access con One-time PIN solo para el correo del dueño.
- Consumes: servidor del Task 9 corriendo.

- [ ] **Step 1: Write the failing check**

Antes de configurar: `curl -s -o /dev/null -w "%{http_code}" https://resumen.<dominio>/` devuelve no-200 (no existe el hostname aún).

- [ ] **Step 2: Configure**

`cloudflared tunnel login` y `cloudflared tunnel create resumen`. Configurar `~/.cloudflared/config.yml` con el hostname y `service: http://127.0.0.1:3100`. Crear el registro DNS con `cloudflared tunnel route dns`. En el panel de Cloudflare Zero Trust, crear la aplicación Access para ese hostname con política "Allow" solo al correo del dueño y método One-time PIN. Documentar cada paso en `docs/cloudflare.md`.

- [ ] **Step 3: Verify**

Sin sesión: `curl -I https://resumen.<dominio>/` devuelve redirección a la página de login de Access (302 o 403), no el panel. Con sesión en el navegador de la Mac y en el celular: el panel carga y el reporte se abre.

- [ ] **Step 4: Commit**

```bash
git add docs/cloudflare.md README.md
git commit -m "docs(cloudflare): túnel y Access para el panel y los reportes"
```

---

## Self-Review

1. **Spec coverage:** vigilados (T2, T8), texto/audio/imagen (T1, T3, T4), resumen por chat y periodo (T5, T7), reporte con categorías y citas de fecha (T5, T6), panel con botón (T8), Cloudflare Access (T10), Docker en Mac (T9), Gemini único (T4, T5), no envía a WhatsApp (no hay función de envío en ninguna tarea), grupos fuera (T1 filtra `@g.us`). Cubierto.
2. **Step scan:** cada paso tiene una acción y un resultado verificable. Pasos de Task 4 Step 5 y Task 9 Step 5 dependen de credenciales reales y servicios externos; se indican como verificación manual.
3. **Types:** `textoMedia` aparece en T5 y T7; `mediaId`/`mimetype` en T1 y T3; `esVigilado` en T2, T7, T8. Consistentes.
4. **Review Focus:** cada punto tiene prueba: punto 1 en T7 (medio falla) y T4 (error); punto 2 en T1; punto 3 en T6; punto 4 en T8 (403); punto 5 en T3 (500) y T7.
5. **Proporción:** plan con código mínimo; firmas y nombres de prueba, no cuerpos completos.
