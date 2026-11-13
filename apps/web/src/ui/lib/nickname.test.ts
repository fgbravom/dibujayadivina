import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import {
  isRoomCodeComplete,
  nicknameProblemText,
  normalizeNickname,
  normalizeRoomCode,
  validateNickname,
} from './nickname';

describe('validateNickname', () => {
  it('acepta los largos del contrato', () => {
    expect(validateNickname('a'.repeat(NICKNAME_MIN_LENGTH))).toBeNull();
    expect(validateNickname('a'.repeat(NICKNAME_MAX_LENGTH))).toBeNull();
    expect(validateNickname('Fulano')).toBeNull();
  });

  it('rechaza apodos muy cortos, también los que son solo espacios', () => {
    expect(validateNickname('')).toBe('too_short');
    expect(validateNickname('a')).toBe('too_short');
    expect(validateNickname('     ')).toBe('too_short');
    expect(validateNickname(' a ')).toBe('too_short');
  });

  it('rechaza apodos muy largos', () => {
    expect(validateNickname('a'.repeat(NICKNAME_MAX_LENGTH + 1))).toBe('too_long');
  });

  it('rechaza caracteres de control', () => {
    expect(validateNickname('Fu\u0007lano')).toBe('invalid_chars');
  });

  it('cuenta tras recortar y colapsar espacios', () => {
    expect(validateNickname('  Ana   María  ')).toBeNull();
    expect(normalizeNickname('  Ana   María  ')).toBe('Ana María');
  });
});

describe('nicknameProblemText', () => {
  it('menciona los límites', () => {
    expect(nicknameProblemText('too_short')).toContain(String(NICKNAME_MIN_LENGTH));
    expect(nicknameProblemText('too_long')).toContain(String(NICKNAME_MAX_LENGTH));
  });
});

describe('normalizeRoomCode', () => {
  it('pasa a mayúsculas y recorta a 4 letras', () => {
    expect(normalizeRoomCode('abcd')).toBe('ABCD');
    expect(normalizeRoomCode('abcdefg')).toBe('ABCD');
  });

  it('ignora espacios, números y signos al pegar', () => {
    expect(normalizeRoomCode(' a b-c1d ')).toBe('ABCD');
  });

  it('indica si el código está completo', () => {
    expect(isRoomCodeComplete('ABC')).toBe(false);
    expect(isRoomCodeComplete('ABCD')).toBe(true);
    expect(isRoomCodeComplete('')).toBe(false);
  });
});
