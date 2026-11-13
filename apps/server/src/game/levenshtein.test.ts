import { describe, expect, it } from 'vitest';
import { levenshtein } from './levenshtein.js';

describe('levenshtein', () => {
  it('es 0 para textos iguales y el largo cuando uno está vacío', () => {
    expect(levenshtein('huemul', 'huemul')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });

  it('cuenta inserción, borrado y sustitución', () => {
    expect(levenshtein('micro', 'micros')).toBe(1);
    expect(levenshtein('micro', 'mico')).toBe(1);
    expect(levenshtein('micro', 'mucro')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('trata la ñ como una letra más', () => {
    expect(levenshtein('ano', 'año')).toBe(1);
  });

  it('sale temprano y devuelve max + 1 al superar el máximo', () => {
    expect(levenshtein('abcdef', 'uvwxyz', 1)).toBe(2);
    expect(levenshtein('abc', 'abcdefgh', 2)).toBe(3);
    expect(levenshtein('abc', 'abd', 1)).toBe(1);
    expect(levenshtein('', 'abc', 1)).toBe(2);
  });
});
