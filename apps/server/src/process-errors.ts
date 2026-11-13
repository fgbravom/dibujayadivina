// Errores globales del proceso: se registran con un log claro y el servidor sigue atendiendo.
// El estado de todas las salas vive en la memoria de este proceso, así que morir por un fallo
// aislado (un manejador de una sala, una promesa suelta) cortaría todas las partidas.

export interface ErrorSource {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  on(event: 'uncaughtException', listener: (error: Error, origin?: string) => void): unknown;
}

export function installGlobalErrorHandlers(
  source: ErrorSource = process,
  logger: Pick<Console, 'error'> = console,
): void {
  source.on('unhandledRejection', (reason) => {
    logger.error('[server] promesa rechazada sin manejar; el servidor sigue en pie', reason);
  });
  source.on('uncaughtException', (error, origin) => {
    logger.error(
      `[server] excepción no capturada (${origin ?? 'desconocido'}); el servidor sigue en pie`,
      error,
    );
  });
}
