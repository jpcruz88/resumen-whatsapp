# resumen-whatsapp

Guarda mensajes de chats de WhatsApp elegidos (vía Evolution API v2) y genera
un resumen por periodo: qué es trabajo y qué es personal, y la lista de tareas
que te pidieron. **No responde ni envía nada a WhatsApp.**

## Uso

1. `cp .env.example .env` y llena las variables (las dos claves de Evolution y
   `SECRETO_WEBHOOK` y `EVOLUTION_DB_PASSWORD` son secretos tuyos; no se imprimen ni se registran).
2. Levanta Evolution y su Postgres: `docker compose up -d` (Evolution solo escucha en
   `127.0.0.1:8080`; Postgres no publica puertos). El compose fija estas variables para que
   Evolution no guarde el contenido de los mensajes y solo guarde chats y contactos (metadatos),
   que el panel necesita para listar los chats:
   - `DATABASE_SAVE_DATA_NEW_MESSAGE=false`, `DATABASE_SAVE_DATA_HISTORIC=false` y
     `DATABASE_SAVE_MESSAGE_UPDATE=false`: ni mensajes nuevos, ni historial, ni ediciones.
   - `DATABASE_SAVE_DATA_CHATS=true` y `DATABASE_SAVE_DATA_CONTACTS=true`: lista de chats y contactos.
   - `DATABASE_SAVE_DATA_INSTANCE=true`: la instancia sobrevive a un reinicio.
   - `DATABASE_PROVIDER=postgresql` y `DATABASE_CONNECTION_URI`: Evolution necesita Postgres para esto.
3. Crea la instancia y escanea el QR:
   ```
   curl -X POST http://127.0.0.1:8080/instance/create \
     -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
     -d '{"instanceName":"resumen","integration":"WHATSAPP-BAILEYS","qrcode":true}'
   ```
   Abre `http://127.0.0.1:8080/manager` para ver el QR y escanearlo desde WhatsApp.
4. Configura el webhook de la instancia (eventos `MESSAGES_UPSERT`, `MESSAGES_SET` y `CONNECTION_UPDATE` (este último mantiene las notificaciones del celular), cabecera `apikey` = `SECRETO_WEBHOOK`).
   Con `"base64":true` Evolution manda el audio o la imagen dentro del propio webhook y esta app lo
   guarda en `DATOS_DIR/media`; así Evolution no tiene que conservar el mensaje para que lo descargues:
   ```
   curl -X POST http://127.0.0.1:8080/webhook/set/resumen \
     -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
     -d '{"webhook":{"enabled":true,"url":"http://host.docker.internal:3100/webhook/evolution","events":["MESSAGES_UPSERT","MESSAGES_SET","CONNECTION_UPDATE"],"base64":true,"headers":{"apikey":"<SECRETO_WEBHOOK>"}}}'
   ```
5. Arranca el servidor: `npm start` (escucha solo en `127.0.0.1:PUERTO`). Desde el
   panel (`http://127.0.0.1:3100/`) eliges los chats vigilados y generas reportes.
6. Reporte por terminal:
   `node src/cli.js --chat 5215511111111@s.whatsapp.net --desde 2026-11-02 --hasta 2026-11-09`
   Imprime la URL local del reporte (`http://127.0.0.1:3100/reportes/<id>`).

Para abrir el panel desde el celular u otro lugar, con acceso protegido por Cloudflare Access, sigue [docs/cloudflare.md](docs/cloudflare.md).

## Ver la conversación

En el panel, **Ver conversación** abre los mensajes del chat y del periodo elegido como en WhatsApp: con hora, quién escribió, imágenes que se abren y audios con reproductor (y su transcripción si ya se generó un resumen). También hay un botón en cada reporte. No usa Gemini. Los audios de WhatsApp son `.ogg`; si hay `ffmpeg` instalado se convierten a `.m4a` para que suenen en el iPhone y en Safari.

Las imágenes y los audios que llegaron **después** de vigilar el chat ya están guardados. Los del historial importado salen con un botón **Cargar**, que se los pide a WhatsApp de uno en uno (ver `docs/importar-historial.md`).

## Historial anterior

Al vigilar un chat se recupera lo que ya había llegado de él (buzón, ver `docs/importar-historial.md`).

## Privacidad

- Los chats que activas en el panel (`vigilados.json`) se guardan completos: texto, audios e imágenes, sin límite de tiempo.
- Los demás chats dejan su texto y, desde que se vinculó, sus audios e imágenes en `DATOS_DIR/buzon` y `DATOS_DIR/media` (siempre; con `BUZON_DIAS` > 0 el texto se borra pasados esos días). No se ven, no se resumen y no se envían a Gemini hasta que vigilas el chat. Los archivos ocupan disco: revisa `DATOS_DIR/media`.
- Los mensajes, medios y reportes quedan en `DATOS_DIR` (en `.gitignore`). Nunca se suben al repo.
- Los textos se envían a Gemini para resumir. Revisa tu política de uso de la API.

## Pruebas

`npm test` (usa `node:test`, sin dependencias).
