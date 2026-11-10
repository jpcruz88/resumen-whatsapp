# resumen-whatsapp

Guarda mensajes de chats de WhatsApp elegidos (vía Evolution API v2) y genera
un resumen por periodo: qué es trabajo y qué es personal, y la lista de tareas
que te pidieron. **No responde ni envía nada a WhatsApp.**

## Uso

1. `cp .env.example .env` y llena las variables (las dos claves de Evolution y
   `SECRETO_WEBHOOK` son secretos tuyos; no se imprimen ni se registran).
2. Levanta Evolution: `docker compose up -d` (solo escucha en `127.0.0.1:8080`).
3. Crea la instancia y escanea el QR:
   ```
   curl -X POST http://127.0.0.1:8080/instance/create \
     -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
     -d '{"instanceName":"resumen","integration":"WHATSAPP-BAILEYS","qrcode":true}'
   ```
   Abre `http://127.0.0.1:8080/manager` para ver el QR y escanearlo desde WhatsApp.
4. Configura el webhook de la instancia (evento `MESSAGES_UPSERT`, cabecera `apikey` = `SECRETO_WEBHOOK`):
   ```
   curl -X POST http://127.0.0.1:8080/webhook/set/resumen \
     -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
     -d '{"webhook":{"enabled":true,"url":"http://host.docker.internal:3100/webhook/evolution","events":["MESSAGES_UPSERT"],"headers":{"apikey":"<SECRETO_WEBHOOK>"}}}'
   ```
5. Arranca el servidor: `npm start` (escucha solo en `127.0.0.1:PUERTO`). Desde el
   panel (`http://127.0.0.1:3100/`) eliges los chats vigilados y generas reportes.
6. Reporte por terminal:
   `node src/cli.js --chat 5215511111111@s.whatsapp.net --desde 2026-11-02 --hasta 2026-11-09`
   Imprime la URL local del reporte (`http://127.0.0.1:3100/reportes/<id>`).

## Privacidad

- Solo se guardan los chats que activas en el panel (lista `vigilados.json` en `DATOS_DIR`).
- Los mensajes, medios y reportes quedan en `DATOS_DIR` (en `.gitignore`). Nunca se suben al repo.
- Los textos se envían a Gemini para resumir. Revisa tu política de uso de la API.

## Pruebas

`npm test` (usa `node:test`, sin dependencias).
