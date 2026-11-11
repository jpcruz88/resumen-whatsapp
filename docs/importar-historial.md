# Importar el historial de un chat

Los mensajes de un chat **vigilado** se guardan completos (texto, audios e imágenes). Los de los demás chats no se
resumen ni se pueden ver, pero **su texto se guarda aparte, en un buzón temporal** (`datos/buzon`, se conserva siempre
salvo que fijes `BUZON_DIAS`), junto con los datos para volver a pedir sus audios e imágenes. Cuando marcas un chat como vigilado,
todo lo que ya estaba en el buzón pasa a ese chat: el reporte y la conversación incluyen su pasado desde el primer
momento. Los audios e imágenes de ese pasado se cargan con el botón **Cargar**.

El historial que WhatsApp manda **una sola vez, cuando se vincula un dispositivo**, también entra al buzón. Evolution
no guarda historial; este servicio lo recibe por el webhook (evento `MESSAGES_SET`).

## Antes de empezar

1. Si ya vigilas chats, no hace falta marcar nada antes: el resto de los chats se guarda en el buzón y se recupera al
   vigilarlos.
2. Ten el teléfono a la mano: hay que escanear un QR.

## Pasos

Los comandos usan las variables de `.env`; no pegues claves en el chat.

1. Suscribe el webhook también al historial y pide historial completo:

   ```
   curl -X POST http://127.0.0.1:8080/webhook/set/resumen \
     -H "apikey: <EVOLUTION_API_KEY>" -H "Content-Type: application/json" \
     -d '{"webhook":{"enabled":true,"url":"http://host.docker.internal:3100/webhook/evolution","events":["MESSAGES_UPSERT","MESSAGES_SET"],"base64":true,"headers":{"apikey":"<SECRETO_WEBHOOK>"}}}'

   curl -X POST http://127.0.0.1:8080/settings/set/resumen \
     -H "apikey: <EVOLUTION_API_KEY>" -H "Content-Type: application/json" \
     -d '{"rejectCall":false,"msgCall":"","groupsIgnore":false,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":true}'
   ```

2. Cierra la sesión de la instancia y vuelve a conectar para obtener un QR nuevo:

   ```
   curl -X DELETE http://127.0.0.1:8080/instance/logout/resumen -H "apikey: <EVOLUTION_API_KEY>"
   curl http://127.0.0.1:8080/instance/connect/resumen -H "apikey: <EVOLUTION_API_KEY>"
   ```

3. Escanea el QR (WhatsApp → Dispositivos vinculados → Vincular un dispositivo). Mientras la instancia no
   esté vinculada **no llegan mensajes nuevos**, así que hazlo enseguida.
4. WhatsApp manda el historial en lotes durante unos minutos. En `~/Library/Logs/resumen-whatsapp.log`
   aparece `historial importado: N de M` por cada lote.

## Imágenes y audios del historial

El historial trae, por cada imagen o audio, los datos con los que WhatsApp permite volver a pedir el archivo.
Desde la versión 0.7.0 se guardan, y en la conversación cada uno aparece con un botón **Cargar imagen** o
**Cargar audio**. Al pulsarlo se le pide el archivo a WhatsApp (de uno en uno, nunca todos a la vez) y se
guarda para siempre en este equipo.

- Si WhatsApp ya lo borró de sus servidores, Evolution le pide al teléfono que lo vuelva a subir. Eso solo
  funciona si el teléfono sigue teniendo el archivo y está conectado. Si no, el botón avisa y deja reintentar.
- Un historial importado **antes** de la 0.7.0 no trae esos datos: sus imágenes y audios salen como "no
  disponible", sin botón. Para completarlos hay que repetir los pasos de arriba (volver a vincular): los
  mensajes ya guardados no se duplican, solo se les agregan los datos de descarga.
- Los audios recuperados también se transcriben cuando generes un resumen.

## Límites que conviene conocer

- **El archivo no viene con el historial.** Los audios e imágenes anteriores a la vigilancia se recuperan a
  petición con el botón Cargar (ver arriba). Mientras no se carguen, el reporte los marca como "no disponible"
  y las imágenes con pie de foto conservan el pie.
- **La profundidad la decide WhatsApp.** Con `syncFullHistory` manda más que por defecto, pero no se puede
  asegurar hasta qué fecha. Si pides un periodo más viejo de lo que llegó, el reporte sale sin mensajes.
- **Antes de que existiera el buzón (versión 0.8.0)** el historial de los chats no vigilados se descartaba. Ese
  pasado solo vuelve vinculando de nuevo; desde la 0.8.0 todo lo que llega queda en el buzón.
- Volver a vincular es seguro: los mensajes ya guardados no se duplican.
