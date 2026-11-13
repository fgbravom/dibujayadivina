import { ERROR_CODES } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { errorMessage, isErrorCode } from './errors';

describe('errorMessage', () => {
  it('traduce todos los códigos del contrato a un texto no vacío', () => {
    for (const code of ERROR_CODES) {
      const text = errorMessage(code);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toContain(code);
    }
  });

  it('usa los límites reales del contrato en los textos', () => {
    expect(errorMessage('room_full')).toContain('12');
    expect(errorMessage('name_invalid')).toContain('2');
    expect(errorMessage('name_invalid')).toContain('16');
  });

  it('cae al error genérico si llega un código desconocido', () => {
    expect(errorMessage('algo_nuevo' as never)).toBe(errorMessage('internal'));
  });
});

describe('isErrorCode', () => {
  it('reconoce códigos válidos y rechaza el resto', () => {
    expect(isErrorCode('room_full')).toBe(true);
    expect(isErrorCode('nope')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});
