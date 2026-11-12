# Instagram (mensajes directos)

El servicio puede leer los mensajes directos de una cuenta personal de Instagram y mostrarlos en el mismo panel, con resumen y conversación. Es solo lectura: nunca envía ni marca nada como visto.

## Cómo funciona

- Usa la cookie de sesión del navegador (`INSTAGRAM_COOKIE` en `.env`). Es acceso no oficial: Instagram puede pedir verificación, cerrar la sesión o restringir la cuenta.
- Cada ~15 minutos (con variación) revisa la bandeja. En la primera pasada baja hasta `INSTAGRAM_PAGINAS` páginas de 20 mensajes por conversación (10 por omisión); las siguientes solo traen lo nuevo.
- Se detiene a la primera señal de sesión vencida o verificación y no reintenta hasta reiniciar el servicio. Si Instagram pide esperar, reintenta en una hora.
- Solo guarda texto (también el de enlaces y reels compartidos). Fotos, notas de voz y reacciones no se guardan.
- Los chats se guardan como `ig:<id del hilo>`; sus nombres, en `datos/instagram-nombres.json`.

## Poner la cookie

1. Pega el "Copy as cURL" de cualquier petición de instagram.com en `curl-instagram.txt` (raíz del proyecto, ignorado por git) o cópialo al portapapeles.
2. Corre `node scripts/guardar-cookie-instagram.mjs`. Guarda `INSTAGRAM_COOKIE` en `.env` entre comillas simples (el servicio carga el `.env` con zsh) y no muestra el valor.
3. Si la línea quedó sin comillas, `node scripts/guardar-cookie-instagram.mjs --reparar`.
4. Reinicia: `launchctl kickstart -k gui/$(id -u)/local.resumen-whatsapp`.

Cuando la cookie venza, repite los pasos 1, 2 y 4. Nunca la subas a git ni la pegues en un chat.
