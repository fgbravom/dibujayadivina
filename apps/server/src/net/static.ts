// Servidor de archivos estáticos para el cliente compilado, sin dependencias.
// Rutas sin extensión (`/sala/ABCD`) caen en `index.html`; nada fuera de la carpeta es legible.

import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

function reply(res: ServerResponse, status: number, body = ''): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

/** Devuelve un manejador para `rootDir`, o null si la carpeta no existe. */
export function createStaticHandler(rootDir: string): StaticHandler | null {
  if (!existsSync(rootDir)) return null;
  const root = realpathSync(rootDir);

  async function resolveFile(pathname: string): Promise<{ file: string; size: number } | null> {
    // `resolve` trata también `\` como separador en Windows; el chequeo posterior cubre ambos casos.
    const candidate = path.resolve(root, '.' + pathname);
    if (!isInside(root, candidate)) return null;
    try {
      const real = await realpath(candidate);
      if (!isInside(root, real)) return null;
      const info = await stat(real);
      return info.isFile() ? { file: real, size: info.size } : null;
    } catch {
      return null;
    }
  }

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD');
      return reply(res, 405);
    }

    let pathname: string;
    try {
      const raw = (req.url ?? '/').split('?')[0]?.split('#')[0] ?? '/';
      pathname = decodeURIComponent(raw);
    } catch {
      return reply(res, 400);
    }
    if (!pathname.startsWith('/') || pathname.includes('\0')) return reply(res, 400);

    const segments = pathname.split(/[\\/]/).filter((s) => s !== '');
    if (segments.some((s) => s.startsWith('.'))) return reply(res, 404);

    let found = await resolveFile(pathname);
    let isIndex = false;
    if (!found) {
      // Solo las rutas del cliente (sin extensión) caen en index.html; un archivo que falta es 404.
      const last = segments[segments.length - 1] ?? '';
      if (last.includes('.')) return reply(res, 404);
      found = await resolveFile('/index.html');
      isIndex = true;
      if (!found) return reply(res, 404);
    }

    const ext = path.extname(found.file).toLowerCase();
    const isHtml = isIndex || ext === '.html';
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'content-length': found.size,
      'cache-control': isHtml
        ? 'no-cache'
        : pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') return void res.end();

    const stream = createReadStream(found.file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };
}
