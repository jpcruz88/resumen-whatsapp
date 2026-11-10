# resumen-whatsapp

Guarda mensajes de chats de WhatsApp elegidos (vía Evolution API v2) y genera
un resumen por periodo: qué es trabajo y qué es personal, y la lista de tareas
que te pidieron. **No responde ni envía nada a WhatsApp.**

## Uso

1. `cp .env.example .env` y llena las variables.
2. En Evolution, configura el webhook de la instancia:
   - URL: `http://127.0.0.1:3100/webhook/evolution` (o donde corra el servidor)
   - Evento: `MESSAGES_UPSERT`
   - Cabecera `apikey` = `SECRETO_WEBHOOK`
3. Arranca: `npm start`
4. Resumen por terminal:
   `node src/cli.js --chat 5215511111111@s.whatsapp.net --desde 2026-11-02 --hasta 2026-11-09`
5. Resumen por HTTP: `GET /resumen?chat=<JID>&desde=<ISO>&hasta=<ISO>` con cabecera `apikey`.

## Privacidad

- Solo se guardan los chats listados en `CHATS_PERMITIDOS`.
- Los mensajes quedan en `DATOS_DIR` (JSONL, en `.gitignore`). Nunca se suben al repo.
- Los textos se envían a Gemini para resumir. Revisa tu política de uso de la API.

## Pruebas

`npm test` (usa `node:test`, sin dependencias).
