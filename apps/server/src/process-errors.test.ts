import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installGlobalErrorHandlers } from './process-errors.js';
import type { ErrorSource } from './process-errors.js';

describe('installGlobalErrorHandlers', () => {
  it('registra unhandledRejection y uncaughtException sin lanzar ni terminar el proceso', () => {
    const source = new EventEmitter();
    const logger = { error: vi.fn() };
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    installGlobalErrorHandlers(source as unknown as ErrorSource, logger);

    const reason = new Error('promesa suelta');
    expect(() => source.emit('unhandledRejection', reason)).not.toThrow();
    expect(logger.error).toHaveBeenLastCalledWith(
      expect.stringContaining('promesa rechazada'),
      reason,
    );

    const error = new Error('excepción suelta');
    expect(() => source.emit('uncaughtException', error, 'uncaughtException')).not.toThrow();
    expect(logger.error).toHaveBeenLastCalledWith(
      expect.stringContaining('excepción no capturada'),
      error,
    );
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
