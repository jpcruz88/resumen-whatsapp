# Instagram (mensajes directos)

## Importar la exportación oficial (recomendado)

Sin cookie ni riesgo para la cuenta. Funciona con la exportación que Instagram te manda.

1. Centro de cuentas de Meta, luego Tu información y permisos, luego Exportar tu información. Elige el perfil, "Exportar al dispositivo", personaliza solo **Mensajes**, intervalo **Desde el principio** y formato **JSON**.
2. Cuando llegue el aviso, descarga el ZIP (tienes 4 días) y descomprímelo en una carpeta.
3. Importa: `cd /Users/jp/resumen-whatsapp && node scripts/importar-instagram.mjs "<carpeta descomprimida>"`. Si no detecta cuál eres tú, repite con `--yo "Tu nombre en Instagram"`.
4. Se puede repetir con una exportación nueva: no duplica. Solo importa texto (también el de enlaces compartidos).

## Lectura en vivo con cookie (experimental, no funciona hoy)

Instagram quitó la ruta web de mensajes directos (`www.instagram.com/api/v1/direct_v2/…` da 404) y la ruta móvil (`i.instagram.com`) responde 400 sin motivo legible. Seguir exigiría imitar la app oficial, lo que Instagram detecta y castiga en cuentas personales, así que no se hace. Lo que sigue describe el lector tal como quedó.

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
