// Comparación de intentos y máscara de la palabra (PLAN.md sección 2).

import { MAX_REVEALED_FRACTION } from './constants.js';

/**
 * Normaliza un texto para compararlo: minúsculas, sin tildes ni diéresis, sin puntuación
 * y sin espacios dobles ni en los bordes. La `ñ` se conserva (`ano` no es `año`).
 * Guiones y barras cuentan como separador (`ping-pong` = `ping pong`).
 */
export function normalizeGuess(input: string): string {
  const stripped = Array.from(input.toLowerCase().normalize('NFC'), (ch) =>
    ch === 'ñ' ? ch : ch.normalize('NFD').replace(/\p{M}/gu, ''),
  ).join('');
  return stripped
    .replace(/[\p{Pd}_/\\]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMaskable(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * Posiciones (índices sobre `Array.from(word)`) que la máscara oculta y que una pista puede revelar:
 * las letras y dígitos. Espacios y signos se muestran siempre tal cual.
 */
export function getMaskableIndices(word: string): number[] {
  const out: number[] = [];
  Array.from(word).forEach((ch, i) => {
    if (isMaskable(ch)) out.push(i);
  });
  return out;
}

/** Cuántas letras como máximo pueden estar reveladas: un tercio de la palabra, redondeado hacia abajo. */
export function maxRevealCount(word: string): number {
  return Math.floor(getMaskableIndices(word).length * MAX_REVEALED_FRACTION);
}

/**
 * Máscara de la palabra: cada letra es `_`, separadas por un espacio; los espacios de la palabra
 * quedan como espacios (`mote con huesillo` -> `_ _ _ _   _ _ _   _ _ _ _ _ _ _ _`).
 * `revealed` son índices sobre `Array.from(word)` que se muestran con su letra original.
 */
export function maskWord(word: string, revealed: Iterable<number> = []): string {
  const shown = new Set(revealed);
  return Array.from(word, (ch, i) => (isMaskable(ch) && !shown.has(i) ? '_' : ch)).join(' ');
}
