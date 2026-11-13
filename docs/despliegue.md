# Despliegue

Un solo contenedor Node sirve el cliente compilado, Socket.IO y `GET /health`. El servidor corre con `tsx` dentro de la imagen y no se empaqueta con esbuild: `esbuild` no es dependencia directa del proyecto y tsx ya está en el lockfile, así que no hay paso de compilación ni dependencia nueva que mantener (el costo es algo de peso extra en la imagen y un arranque un poco más lento).

## Requisitos

- Docker (para construir la imagen; la plataforma también puede construirla por ti).
- Una cuenta en la plataforma elegida. Fly.io además necesita `flyctl`.
- La plataforma debe permitir WebSockets persistentes, HTTPS y **una sola instancia**: el estado de las partidas vive en la memoria del proceso.

## Construir y correr en local

```sh
docker build -t dibujayadivina .
docker run --rm -p 8080:8080 --name dya dibujayadivina
```

Abre <http://localhost:8080>. Comprobaciones rápidas: `curl localhost:8080/health` devuelve `{"ok":true}` y `localhost:8080/sala/ABCD` devuelve el HTML del cliente. Para detenerlo, `Ctrl+C` (o `docker stop dya` si lo corriste con `-d`).

## Fly.io

1. Instala `flyctl` e inicia sesión: `fly auth login`.
2. Edita `fly.toml`: reemplaza `app` por un nombre único (será `<app>.fly.dev`).
3. Confirma la región: `fly platform regions`. El archivo usa `scl` (Santiago); si no aparece en tu cuenta, cambia `primary_region` por `gru` (São Paulo) u otra cercana.
4. Registra la app sin desplegar: `fly launch --no-deploy --copy-config`. Responde que no a bases de datos y a otros extras.
5. Despliega con una sola máquina: `fly deploy --ha=false`. Sin esa bandera Fly crea dos máquinas y las salas quedarían repartidas.
6. Verifica: `fly status` debe mostrar una máquina y el chequeo en `passing`; abre `https://<app>.fly.dev`.

Compromiso de costo: `fly.toml` usa `auto_stop_machines = "off"`, por lo que la máquina queda encendida siempre y no pierde salas. Con `"stop"` Fly la apaga sin tráfico (más barato) a costa de perder las salas vacías y de un arranque en frío para el primer visitante.

## Railway o Render

Sirven igual: crea un servicio web desde este repositorio con el `Dockerfile`, una única instancia, y deja que la plataforma inyecte `PORT` (la imagen ya escucha en `0.0.0.0`); apunta el chequeo de salud a `/health`.

## Variables de entorno

| Variable        | Por defecto en la imagen | Uso                                                                  |
| --------------- | ------------------------ | -------------------------------------------------------------------- |
| `PORT`          | `8080`                   | Puerto de escucha. Debe coincidir con `internal_port` de `fly.toml`. |
| `HOST`          | `0.0.0.0`                | Interfaz de escucha.                                                 |
| `WEB_DIR`       | `/app/web`               | Carpeta del cliente compilado.                                       |
| `NODE_ENV`      | `production`             |                                                                      |
| `DYA_MAX_ROOMS` | `500` (del servidor)     | Tope de salas simultáneas; opcional.                                 |

Las variables `DYA_*` de modo de pruebas (`DYA_TEST`, `DYA_DRAW_MS`, etc.) no deben fijarse en producción.

## Advertencia: los redespliegues cortan las partidas

Todo el estado está en memoria. Cada `fly deploy`, reinicio o cambio de configuración reinicia el proceso y se pierden las salas en curso: los jugadores verán que la sala ya no existe. Despliega cuando no haya partidas activas.
