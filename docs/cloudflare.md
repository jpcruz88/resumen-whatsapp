# Túnel de Cloudflare y acceso protegido al panel

Esta guía publica el panel de `resumen-whatsapp` en un hostname tuyo, con acceso
solo para tu correo. El servidor sigue escuchando solo en `127.0.0.1`; el túnel
es lo único que sale a internet, y Cloudflare Access es lo único que decide quién entra.

Usa siempre tu propio dominio y tu propio correo. En esta guía aparecen como
marcadores: `TU-DOMINIO` (tu dominio) y `TU-CORREO` (tu correo de dueño).

## Requisitos previos

- Una cuenta de Cloudflare.
- Un dominio agregado a Cloudflare (con sus nameservers apuntando a Cloudflare).
- `cloudflared` instalado en la Mac:
  ```
  brew install cloudflared
  ```
- El servidor corriendo en `127.0.0.1:3100`. Con `PUERTO=3100` en el entorno:
  ```
  npm start
  ```
  Comprueba que responde en la Mac antes de seguir: `curl -I http://127.0.0.1:3100/`.

> `npm start` no lee `.env` por sí solo. Si usas `.env`, exporta las variables
> antes de arrancar: `set -a; source .env; set +a; npm start`.

## Paso 1: iniciar sesión en cloudflared

```
cloudflared tunnel login
```

Se abre el navegador. Elige el dominio `TU-DOMINIO` y autoriza. Esto guarda un
certificado en `~/.cloudflared/`. Lo ejecutas tú, en tu navegador.

## Paso 2: crear el túnel y su configuración

```
cloudflared tunnel create resumen
```

El comando imprime un ID de túnel y crea un archivo de credenciales en
`~/.cloudflared/<ID-DEL-TUNEL>.json`. No compartas ese archivo.

Crea `~/.cloudflared/config.yml` con este contenido. Reemplaza `<ID-DEL-TUNEL>`
por el ID que imprimió el paso anterior, y `resumen.TU-DOMINIO` por tu hostname:

```yaml
tunnel: <ID-DEL-TUNEL>
credentials-file: /Users/TU-USUARIO/.cloudflared/<ID-DEL-TUNEL>.json

ingress:
  - hostname: resumen.TU-DOMINIO
    service: http://127.0.0.1:3100
  - service: http_status:404
```

La última regla (`http_status:404`) es obligatoria: responde 404 a cualquier
otro hostname que llegue al túnel.

## Paso 3: crear el registro DNS

```
cloudflared tunnel route dns resumen resumen.TU-DOMINIO
```

Esto crea un registro CNAME en tu zona de Cloudflare que apunta al túnel.

## Paso 4: proteger el hostname con Cloudflare Access

En el panel de Cloudflare, abre **Zero Trust** y sigue estos pasos:

1. **Identity providers:** agrega **One-time PIN** (código de un solo uso por correo).
   Si ya existe, no hace falta nada más.
2. **Access > Applications:** crea una aplicación **Self-hosted**.
   - Nombre: `resumen`.
   - Dominio de la aplicación: `resumen.TU-DOMINIO`.
3. **Política de acceso:** crea una política con:
   - Acción: **Allow**.
   - Regla de inclusión: **Emails** = `TU-CORREO`.
   - Ninguna otra regla de inclusión (ni dominios completos, ni "Everyone").
4. Guarda la aplicación. Revisa que solo aparezca la política anterior.

Esta política es la única barrera del panel. Revísala después de cada cambio.

## Paso 5: configurar el host permitido y arrancar el túnel

En `.env`, agrega el hostname (sin `https://` ni barra final):

```
PANEL_HOSTS=resumen.TU-DOMINIO
```

El servidor solo acepta peticiones cuyo `Host` esté en la lista local y en
`PANEL_HOSTS`. Reinicia `npm start` después de cambiarlo.

Con el servidor corriendo, en otra terminal:

```
cloudflared tunnel run resumen
```

Deja esa terminal abierta mientras quieras usar el panel desde fuera.

## Verificación

**1. Sin sesión, debe pedir login.** Desde cualquier terminal, sin navegador abierto:

```
curl -I https://resumen.TU-DOMINIO/
```

Debe responder una redirección (302) o un 403 hacia la página de login de Access
(`...cloudflareaccess.com`). **No** debe responder `200` ni mostrar el panel.
Si responde `200`, detente: la aplicación de Access no está aplicando la política.

**2. Con sesión, el panel carga.**

- En el navegador de la Mac: abre `https://resumen.TU-DOMINIO/`, escribe tu correo,
  introduce el código de un solo uso que llega a ese correo. El panel debe cargar.
- Genera un reporte desde el panel y abre el enlace del reporte.
- En tu celular: repite el mismo flujo con el mismo correo. El panel debe cargar
  y el reporte debe abrirse.

## Notas de seguridad

- **La Mac debe estar encendida** y con el servidor y `cloudflared tunnel run resumen`
  corriendo. Si se apaga o se duerme, el enlace deja de funcionar.
- **Access es la única autenticación del panel.** El servidor no pide contraseña.
  Revisa la política del Paso 4 después de configurar y cada vez que cambies la
  aplicación o los correos permitidos.
- **Nunca pongas claves en esta guía, en el repo ni en capturas.** Las claves de
  Evolution, `SECRETO_WEBHOOK` y `GEMINI_API_KEY` viven solo en `.env`, que está en
  `.gitignore`. El archivo de credenciales del túnel (`~/.cloudflared/*.json`) tampoco se sube a ningún lado.
- Si sospechas que alguien más entró, revoca sesiones en Zero Trust y cambia
  la política a un correo que no uses.
