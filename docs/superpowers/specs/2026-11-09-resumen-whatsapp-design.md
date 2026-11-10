# Diseño: resumen de chats de WhatsApp

Fecha: 2026-11-09
Estado: borrador v2, pendiente de aprobación del usuario

## Intención y por qué

El dueño de la cuenta habla con clientes y con gente personal por WhatsApp. Con mucho movimiento
se le olvidan tareas y temas. Quiere pedir el resumen de un chat por un periodo y ver,
separado por categorías, qué es trabajo, qué es personal y qué tareas le pidieron.

## Metas

- Elegir, en un panel web, qué chats de Evolution se vigilan. Solo esos se guardan.
- Guardar mensajes de texto, audios e imágenes de los chats vigilados.
- Al llegar un audio o imagen, bajar el archivo. Al pedir un resumen, transcribir o describir.
- Pedir desde el panel: un chat, un periodo ("hoy", "esta semana", desde/hasta).
- Generar un reporte en HTML con las categorías: **Trabajo** (tareas que me pidieron y temas)
  y **Personal**. Cada tarea cita fecha y hora del mensaje original.
- Ver el reporte desde la Mac o el celular, con un link.

## No metas

- No responder mensajes ni enviar nada a WhatsApp.
- No resúmenes automáticos o programados: se piden desde el panel.
- No grupos (decisión propia, ver abajo).
- No importar historial anterior al arranque del servidor.

## Antimetas (si pasa esto, falló aunque funcione)

- Guardar un chat que no está marcado como vigilado.
- Exponer el servidor local o los datos sin pasar por el acceso protegido de Cloudflare.
- Guardar conversaciones o medios de clientes dentro de Cloudflare. Los datos se quedan en la Mac.
- Inventar tareas o fechas que no aparecen en los mensajes.

## Arquitectura

- **Mac:** Evolution API en Docker, el servicio de resumen (Node) y la base de datos local
  (JSONL y archivos de medios).
- **Cloudflare:** un túnel desde la Mac y acceso protegido (Access, con PIN al correo) para
  el panel y los reportes. Cloudflare solo enruta; no guarda datos.
- **Gemini:** transcripción, descripción de imágenes y resumen.
- El panel y los reportes solo funcionan mientras la Mac esté encendida y el túnel activo.

## Restricciones y riesgos aceptados

- **Conexión en vivo con Evolution API v2** (no oficial, usa el protocolo de WhatsApp Web).
  El usuario conoce y acepta el riesgo de suspensión de su número.
- Textos, audios e imágenes de los chats vigilados se envían a Gemini (Google). El usuario lo acepta.
- Proveedor único: **Gemini**. DeepSeek no tiene soporte de audio ni imagen confirmado.
- Uso personal, pocos mensajes diarios: costo bajo.

## Decisiones tomadas

1. **Chats vigilados:** el panel lista los chats que Evolution tiene y el usuario marca cuáles
   vigilar. La lista se guarda en el almacén local. Lo no marcado se descarta sin guardarse.
2. **Almacenamiento:** mensajes en JSONL por chat; medios en `DATOS_DIR/media/`; todo local, fuera de git.
3. **Acceso al archivo de medios:** se pide a Evolution con `getBase64FromMediaMessage`
   (método documentado de Evolution). La URL del mensaje está cifrada y no sirve directo.
4. **Resumen por chat y periodo:** el usuario elige el chat y el rango en el panel. No hay
   resumen mezclado de varios chats.
5. **Quién pidió la tarea:** es el contacto del chat. No hace falta un mapa de nombres.
6. **Audio:** al pedir el resumen, se transcribe en el idioma detectado. Se guarda la transcripción
   junto al archivo, para no volver a pagarla.
7. **Imagen:** al pedir el resumen, se describe en una línea. Se guarda junto al archivo.
8. **Resumen:** bloques Trabajo → Tareas que me pidieron; Trabajo → Temas; Personal.
   Lo dudoso va a Personal con `(?)`. Cada tarea cita fecha y hora.
9. **Reporte:** HTML generado en la Mac, servido por el túnel de Cloudflare con Access.
   El link del panel abre el reporte en la Mac o en el celular.
10. **Red local:** el servicio escucha en `127.0.0.1`. El webhook de Evolution exige la
    cabecera `apikey` igual a `SECRETO_WEBHOOK`.
11. **Grupos:** fuera del alcance. *(Decisión propia; se puede pedir después.)*
12. **Retención:** mensajes y medios hasta que el usuario los borre. *(Decisión propia.)*
13. **Modelo:** `GEMINI_MODEL` configurable. Se verifica al construir que acepte audio e imagen.

## Lo que queda para quien construye

- Llamada a Gemini para audio (en línea o por archivo, según tamaño).
- Manejo de errores de Evolution, reintentos y mensajes duplicados.
- Configuración del túnel y de Access; qué hace falta en Cloudflare (`wrangler` ya autenticado).
- Pruebas: cada parte nueva empieza con una prueba que falle.

## Éxito

- Pedir un periodo de una semana de un chat devuelve el reporte en menos de un minuto.
- Cada tarea listada tiene su mensaje original citado.
- Un audio o una imagen de un chat vigilado aparece transcrito o descrito en el reporte.
- El reporte se abre desde la Mac y desde el celular, con el acceso protegido.
