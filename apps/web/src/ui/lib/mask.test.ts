import { maskWord } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { letterCount, maskAriaLabel, parseMask, symbolsFromWord } from './mask';

describe('parseMask', () => {
  it('separa palabras y letras según el formato de maskWord', () => {
    const words = parseMask(maskWord('mote con'));
    expect(words).toHaveLength(2);
    expect(words[0]).toHaveLength(4);
    expect(words[1]).toHaveLength(3);
    expect(words.flat().every((s) => s.hidden)).toBe(true);
  });

  it('marca las letras reveladas', () => {
    const words = parseMask(maskWord('micro', [0, 4]));
    expect(words[0]?.map((s) => s.char)).toEqual(['m', '_', '_', '_', 'o']);
    expect(words[0]?.map((s) => s.hidden)).toEqual([false, true, true, true, false]);
  });

  it('los signos no cuentan como letras', () => {
    const words = parseMask(maskWord('ping-pong'));
    const dash = words[0]?.find((s) => s.char === '-');
    expect(dash?.isLetter).toBe(false);
    expect(letterCount(words)).toBe(8);
  });

  it('conserva la ñ revelada', () => {
    const words = parseMask(maskWord('año', [1]));
    expect(words[0]?.[1]).toEqual({ char: 'ñ', hidden: false, isLetter: true });
  });

  it('tolera una máscara vacía', () => {
    expect(parseMask('')).toEqual([]);
  });
});

describe('symbolsFromWord', () => {
  it('parte la palabra en palabras y caracteres visibles', () => {
    const words = symbolsFromWord('mote con huesillo');
    expect(words.map((w) => w.length)).toEqual([4, 3, 8]);
    expect(words.flat().some((s) => s.hidden)).toBe(false);
  });
});

describe('maskAriaLabel', () => {
  it('cuenta letras y pistas', () => {
    expect(maskAriaLabel(maskWord('micro'))).toBe('Palabra de 5 letras');
    expect(maskAriaLabel(maskWord('micro', [0]))).toBe('Palabra de 5 letras, con una pista: m');
    expect(maskAriaLabel(maskWord('micro', [0, 4]))).toBe(
      'Palabra de 5 letras, con 2 pistas: m, o',
    );
  });
});
