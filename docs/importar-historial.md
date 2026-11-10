# Importar el historial de un chat

Por defecto el servicio guarda los mensajes que llegan **después** de marcar un chat como vigilado.
Para poder resumir fechas anteriores hay que importar el historial que WhatsApp manda **una sola vez,
cuando se vincula un dispositivo**. Evolution no guarda historial; este servicio lo recibe por el webhook
(evento `MESSAGES_SET`), se queda solo con el de los chats vigilados y descarta el resto.

## Antes de empezar

1. Abre el panel y **marca todos los chats y grupos cuyo historial quieras**. Lo que no esté vigilado en el
   momento de vincular se descarta y no se puede recuperar sin volver a vincular.
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

## Límites que conviene conocer

- **Solo texto.** Los audios e imágenes anteriores a la vigilancia no traen el archivo y no se pueden pedir
  después: en el reporte salen como "[audio anterior a la vigilancia: no disponible]". Las imágenes con pie
  de foto conservan el pie.
- **La profundidad la decide WhatsApp.** Con `syncFullHistory` manda más que por defecto, pero no se puede
  asegurar hasta qué fecha. Si pides un periodo más viejo de lo que llegó, el reporte sale sin mensajes.
- **Un chat que no estaba vigilado al vincular** no tiene historial importado. Para traerlo hay que marcarlo
  y repetir los pasos.
- Volver a vincular es seguro: los mensajes ya guardados no se duplican.
