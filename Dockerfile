# syntax=docker/dockerfile:1

# Imagen de producción de Dibuja y Adivina: un solo proceso Node que sirve el
# cliente compilado, Socket.IO y GET /health. Ver docs/despliegue.md.
#
# El servidor corre con tsx (sin paso de compilación): @dya/shared se consume
# como TypeScript y tsx lo transpila al arrancar.

ARG NODE_VERSION=22

# --- Etapa 1: dependencias, cliente compilado y servidor aislado -------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

# Corepack toma la versión de pnpm del campo packageManager del package.json raíz.
RUN corepack enable

# Primero solo los manifiestos: la capa de instalación se reutiliza mientras
# no cambien las dependencias.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @dya/web build

# Servidor con sus dependencias reales (sin enlaces al workspace). Se incluye
# tsx, que es devDependency, porque es el que ejecuta el TypeScript.
RUN pnpm --filter @dya/server deploy /out

# --- Etapa 2: imagen final ----------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    WEB_DIR=/app/web
WORKDIR /app/server

COPY --from=build --chown=node:node /out/ ./
COPY --from=build --chown=node:node /app/apps/web/dist /app/web

# El usuario "node" ya existe en la imagen oficial y no tiene privilegios.
USER node
EXPOSE 8080

# Node ya está en la imagen: no hace falta instalar curl ni wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "src/index.ts"]
