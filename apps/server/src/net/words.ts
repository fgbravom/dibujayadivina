// Selectores de palabras que se inyectan al motor como `pickWords`.

import { pickOptions } from '../words/index.js';
import type { WordEntry } from '../game/index.js';

export type WordPicker = (used: readonly string[], n: number) => WordEntry[];

/** Selector real: opciones del banco sin repetir dentro de la partida. */
export function bankWordPicker(rng: () => number): WordPicker {
  return (used, n) =>
    pickOptions(new Set(used), n, rng).map((entry) =>
      entry.accept ? { text: entry.text, accept: entry.accept } : { text: entry.text },
    );
}

/**
 * Selector determinista para pruebas: entrega las primeras `n` palabras de la lista que aún no se usan
 * y, cuando quedan menos de `n`, vuelve a empezar desde el principio.
 */
export function fixedWordPicker(words: readonly string[]): WordPicker {
  return (used, n) => {
    const taken = new Set(used);
    let pool = words.filter((w) => !taken.has(w));
    if (pool.length < n) pool = [...words];
    return pool.slice(0, n).map((text) => ({ text }));
  };
}
