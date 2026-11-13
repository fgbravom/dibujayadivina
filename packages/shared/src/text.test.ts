import { describe, expect, it } from 'vitest';
import { getMaskableIndices, maskWord, maxRevealCount, normalizeGuess } from './text.js';

describe('normalizeGuess', () => {
  it('pasa a minúsculas', () => {
    expect(normalizeGuess('SOPAIPILLA')).toBe('sopaipilla');
  });

  it('quita tildes y diéresis', () => {
    expect(normalizeGuess('Cóndor')).toBe('condor');
    expect(normalizeGuess('Valparaíso')).toBe('valparaiso');
    expect(normalizeGuess('pingüino')).toBe('pinguino');
  });

  it('conserva la ñ', () => {
    expect(normalizeGuess('Año')).toBe('año');
    expect(normalizeGuess('ÑANDÚ')).toBe('ñandu');
    expect(normalizeGuess('ano')).not.toBe(normalizeGuess('año'));
  });

  it('funciona con texto en forma descompuesta (NFD)', () => {
    expect(normalizeGuess('año')).toBe('año');
    expect(normalizeGuess('cóndor')).toBe('condor');
  });

  it('quita puntuación', () => {
    expect(normalizeGuess('¡La micro!')).toBe('la micro');
    expect(normalizeGuess('guata...')).toBe('guata');
  });

  it('trata guiones como separador', () => {
    expect(normalizeGuess('ping-pong')).toBe('ping pong');
  });

  it('colapsa espacios dobles y recorta los bordes', () => {
    expect(normalizeGuess('  mote   con \t huesillo  ')).toBe('mote con huesillo');
  });

  it('devuelve vacío si no queda nada', () => {
    expect(normalizeGuess(' ¿?! ')).toBe('');
  });

  it('es idempotente', () => {
    const once = normalizeGuess('  ¡Torres  del Páine! ');
    expect(normalizeGuess(once)).toBe(once);
  });
});

describe('maskWord', () => {
  it('oculta cada letra y las separa con un espacio', () => {
    expect(maskWord('guata')).toBe('_ _ _ _ _');
  });

  it('respeta los espacios entre palabras', () => {
    expect(maskWord('la micro')).toBe('_ _   _ _ _ _ _');
  });

  it('revela los índices pedidos con su letra original', () => {
    expect(maskWord('cóndor', [1, 5])).toBe('_ ó _ _ _ r');
    expect(maskWord('cóndor', new Set([0]))).toBe('c _ _ _ _ _');
  });

  it('los espacios no cuentan como índice revelable y se mantienen', () => {
    expect(maskWord('la micro', [2])).toBe('_ _   _ _ _ _ _');
    expect(maskWord('la micro', [3])).toBe('_ _   m _ _ _ _');
  });

  it('ignora índices fuera de rango', () => {
    expect(maskWord('sol', [10, -1])).toBe('_ _ _');
  });

  it('muestra los signos tal cual', () => {
    expect(maskWord('ping-pong')).toBe('_ _ _ _ - _ _ _ _');
  });

  it('con todo revelado muestra la palabra separada por espacios', () => {
    expect(maskWord('año', [0, 1, 2])).toBe('a ñ o');
  });
});

describe('getMaskableIndices / maxRevealCount', () => {
  it('lista solo letras', () => {
    expect(getMaskableIndices('la micro')).toEqual([0, 1, 3, 4, 5, 6, 7]);
  });

  it('un tercio de las letras, hacia abajo', () => {
    expect(maxRevealCount('sol')).toBe(1);
    expect(maxRevealCount('mate')).toBe(1);
    expect(maxRevealCount('guata')).toBe(1);
    expect(maxRevealCount('cóndor')).toBe(2);
    expect(maxRevealCount('la micro')).toBe(2);
    expect(maxRevealCount('te')).toBe(0);
  });
});
