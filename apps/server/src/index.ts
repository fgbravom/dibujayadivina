// Punto de entrada del servidor: lee variables de entorno y levanta `createGameServer`.
//
// Variables de entorno
//   PORT           puerto de escucha (por defecto 3001)
//   HOST           interfaz de escucha (por defecto todas)
//   WEB_DIR        carpeta del cliente compilado (por defecto apps/web/dist, si existe)
//   DYA_MAX_ROOMS  tope de salas simultáneas (por defecto 500)
//
// Modo de pruebas: solo se leen estas si DYA_TEST=1 (pruebas e2e deterministas)
//   DYA_CHOOSE_MS    duración de elegir palabra, en ms
//   DYA_DRAW_MS      duración de dibujar, en ms (reemplaza el ajuste de segundos de la sala)
//   DYA_TURN_END_MS  pausa de fin de turno, en ms
//   DYA_GRACE_MS     gracia de reconexión, en ms
//   DYA_WORDS        palabras fijas separadas por coma (mínimo 3), p. ej. "huemul,cueca,micro"

import { createGameServer } from './net/index.js';
import type { GameServerOptions } from './net/index.js';

function intEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo, recibí "${raw}"`);
  }
  return value;
}

function readOptions(): GameServerOptions {
  const options: GameServerOptions = { port: intEnv('PORT') ?? 3001 };
  if (process.env.HOST) options.host = process.env.HOST;
  if (process.env.WEB_DIR) options.webDir = process.env.WEB_DIR;
  const maxRooms = intEnv('DYA_MAX_ROOMS');
  if (maxRooms !== undefined) options.maxRooms = maxRooms;

  if (process.env.DYA_TEST === '1') {
    const chooseMs = intEnv('DYA_CHOOSE_MS');
    const drawMs = intEnv('DYA_DRAW_MS');
    const turnEndMs = intEnv('DYA_TURN_END_MS');
    const graceMs = intEnv('DYA_GRACE_MS');
    if (chooseMs !== undefined) options.chooseMs = chooseMs;
    if (drawMs !== undefined) options.drawMs = drawMs;
    if (turnEndMs !== undefined) options.turnEndMs = turnEndMs;
    if (graceMs !== undefined) options.graceMs = graceMs;
    const words = process.env.DYA_WORDS?.split(',')
      .map((w) => w.trim())
      .filter((w) => w !== '');
    if (words && words.length > 0) options.words = words;
  }
  return options;
}

async function main(): Promise<void> {
  const server = await createGameServer(readOptions());
  console.log(`[server] escuchando en ${server.url}`);

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err: unknown) => {
  console.error('[server] no se pudo iniciar', err);
  process.exit(1);
});
