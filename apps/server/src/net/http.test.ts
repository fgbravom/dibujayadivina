import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeAll, startServer } from './testing.js';

const SECRET = 'contenido-secreto-fuera-de-la-carpeta';
const INDEX = '<!doctype html><title>cliente</title>';

let base = '';
let webDir = '';

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'dya-static-'));
  webDir = path.join(base, 'dist');
  mkdirSync(path.join(webDir, 'assets'), { recursive: true });
  writeFileSync(path.join(webDir, 'index.html'), INDEX);
  writeFileSync(path.join(webDir, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(path.join(base, 'secret.txt'), SECRET);
});

afterEach(async () => {
  await closeAll();
  rmSync(base, { recursive: true, force: true });
});

/** Petición con la ruta tal cual, sin que el cliente normalice los `..`. */
function get(
  port: number,
  rawPath: string,
  method = 'GET',
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: rawPath, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('HTTP', () => {
  it('responde /health', async () => {
    const server = await startServer({ webDir });
    const res = await get(server.port, '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('sirve el cliente y cae en index.html para las rutas del cliente', async () => {
    const server = await startServer({ webDir });
    for (const route of ['/', '/index.html', '/sala/ABCD', '/sala/ABCD?x=1']) {
      const res = await get(server.port, route);
      expect(res.status, route).toBe(200);
      expect(res.body, route).toBe(INDEX);
    }
    const js = await get(server.port, '/assets/app.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.headers['cache-control']).toContain('immutable');
    expect((await get(server.port, '/assets/app.js', 'HEAD')).body).toBe('');
  });

  it('index.html se revalida siempre y los assets con hash se cachean por un año', async () => {
    const server = await startServer({ webDir });
    // Una recarga normal no debe traer el HTML viejo tras un despliegue (el cliente compara su
    // versión con la de este archivo).
    for (const route of ['/', '/index.html', '/sala/ABCD']) {
      const res = await get(server.port, route);
      expect(res.headers['cache-control'], route).toBe('no-cache');
    }
    const js = await get(server.port, '/assets/app.js');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('un archivo que falta es 404 y no index.html', async () => {
    const server = await startServer({ webDir });
    expect((await get(server.port, '/assets/otro.js')).status).toBe(404);
    expect((await get(server.port, '/favicon.ico')).status).toBe(404);
  });

  it('no deja leer fuera de la carpeta', async () => {
    const server = await startServer({ webDir });
    const attempts = [
      '/../secret.txt',
      '/..%2fsecret.txt',
      '/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
      '/..%5csecret.txt',
      '/..\\secret.txt',
      '//../secret.txt',
      '/%00secret.txt',
      '/%c0%ae%c0%ae/secret.txt',
    ];
    for (const attempt of attempts) {
      const res = await get(server.port, attempt);
      expect(res.body, attempt).not.toContain(SECRET);
      expect(res.status, attempt).not.toBe(200);
    }
  });

  it('solo acepta GET y HEAD', async () => {
    const server = await startServer({ webDir });
    expect((await get(server.port, '/', 'POST')).status).toBe(405);
  });

  it('sin carpeta del cliente solo expone /health', async () => {
    const server = await startServer({ webDir: path.join(base, 'no-existe') });
    expect((await get(server.port, '/')).status).toBe(404);
    expect((await get(server.port, '/health')).status).toBe(200);
  });
});
