# Prueba manual con servicios reales

Las pruebas automáticas usan respuestas simuladas. Estos pasos confirman lo que solo
se puede ver con Evolution, Gemini y Cloudflare reales. Hazlos en este orden.

## 1. Preparar

1. `cp .env.example .env` y llena todas las variables. Genera valores propios para
   `SECRETO_WEBHOOK`, `EVOLUTION_API_KEY` y `EVOLUTION_DB_PASSWORD`.
2. La imagen de Evolution está fijada a `v2.3.7` en `docker-compose.yml`. Si la subes de
   versión, vuelve a probar el paso 3 completo.
3. `docker compose config -q` debe terminar sin errores (validado con Docker Compose 5.x).

## 2. Gemini acepta audio e imagen (lo que más puede fallar)

Con una nota de voz `.ogg` y una foto `.jpg` reales, desde la carpeta del proyecto:

```
GEMINI_API_KEY=... node -e "import('./src/medios.js').then(async m=>console.log(await m.procesarMedio({tipo:'audio',ruta:'/ruta/audio.ogg',mimetype:'audio/ogg',apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.1-flash-lite'})))"
```

Repite con `tipo:'imagen'`, un `.jpg` y `mimetype:'image/jpeg'`.
Si el modelo rechaza el audio, cambia `GEMINI_MODEL` en `.env` y repite.
Anota el modelo que funcione en el README.

## 3. Evolution y el webhook

1. `docker compose up -d`, crea la instancia y escanea el QR con el teléfono.
2. Configura el webhook de la instancia como indica el README (evento `MESSAGES_UPSERT`,
   `base64: true`, cabecera `apikey` igual a `SECRETO_WEBHOOK`).
3. Arranca el servicio: `npm start`.
4. Abre el panel local y espera a que el chat aparezca en la lista.
5. Desde otro teléfono manda a ese chat un texto, un audio y una foto.
6. Revisa `DATOS_DIR`: debe haber una línea nueva en el archivo `.jsonl` del chat y los
   archivos en `DATOS_DIR/media/`.
7. **Confirma la ruta del base64.** Si el audio no aparece en `media/`, el campo base64
   llega en otra ruta del payload. El analizador acepta `data.message.base64` y
   `data.base64`. La fuente de Evolution lo escribe con un typo (`messsage`), así que
   puede hacer falta ajustarlo.
8. Confirma que la lista de chats del panel muestra tus chats (no solo los nuevos) y que
   el campo JID coincide con el que llega en el webhook.

## 4. Reporte de punta a punta

1. En el panel, elige el chat y el día de hoy, y pulsa "Generar resumen".
2. El reporte debe traer Trabajo (tareas con fecha y hora), Temas y Personal, con el audio
   transcrito y la foto descrita.
3. Pide un periodo "hoy a hoy" y confirma que incluye los mensajes del día completo.

## 5. Cloudflare

Sigue `docs/cloudflare.md`. Al terminar, sin sesión `curl -I https://resumen.TU-DOMINIO/`
debe redirigir al login de Access, nunca mostrar el panel. Con sesión, el reporte abre en
la Mac y en el celular.

## Si algo falla

- Audio con "no se pudo procesar": revisa el paso 2 (modelo) y el paso 3.7 (ruta del base64).
- Chat que no aparece en la lista: revisa que el webhook llegue (log del servicio) y que el `remoteJid` no sea un estado o canal.
- Webhook con 401: la cabecera `apikey` no coincide con `SECRETO_WEBHOOK`.
- Panel con 403: agrega tu hostname a `PANEL_HOSTS`.
