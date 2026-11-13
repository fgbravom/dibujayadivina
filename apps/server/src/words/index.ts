// Banco de palabras del juego y selección de opciones (PLAN.md sección 2).

import { normalizeGuess } from '@dya/shared';
import rawWords from './words.json' with { type: 'json' };

export type WordCategory =
  'comida' | 'lugares' | 'naturaleza' | 'cultura' | 'chilenismos' | 'objetos' | 'personajes';
export type WordDifficulty = 1 | 2 | 3;

export interface WordEntry {
  text: string;
  category: WordCategory;
  difficulty: WordDifficulty;
  /** Variantes aceptadas además de `text` (plurales, sinónimos). */
  accept?: string[];
}

export const WORDS: readonly WordEntry[] = rawWords as WordEntry[];

const DIFFICULTIES: readonly WordDifficulty[] = [1, 2, 3];

/** Fisher-Yates con el rng inyectado; devuelve una copia. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/**
 * Elige `n` palabras distintas para ofrecer como opciones. Evita las de `used` mientras haya
 * suficientes; si una dificultad se agota, recurre a las usadas de ese nivel. Intenta una palabra
 * de cada dificultad antes de repetir nivel.
 */
export function pickOptions(used: ReadonlySet<string>, n: number, rng: () => number): WordEntry[] {
  if (n > WORDS.length) {
    throw new RangeError(`pickOptions: n=${n} supera el tamaño del banco (${WORDS.length})`);
  }

  const fresh = WORDS.filter((w) => !used.has(w.text));
  const pool = fresh.length >= n ? fresh : WORDS;

  const freshQueues = new Map(
    DIFFICULTIES.map((d) => [d, shuffle(fresh.filter((w) => w.difficulty === d), rng)] as const),
  );
  const usedQueues = new Map(
    DIFFICULTIES.map(
      (d) => [d, shuffle(WORDS.filter((w) => w.difficulty === d && used.has(w.text)), rng)] as const,
    ),
  );
  const order = shuffle(DIFFICULTIES, rng);

  const picked: WordEntry[] = [];
  const seen = new Set<string>();

  function nextFromDifficulty(d: WordDifficulty): WordEntry | undefined {
    return freshQueues.get(d)?.shift() ?? usedQueues.get(d)?.shift();
  }

  // Rondas por dificultad: en cada vuelta toma una palabra de cada nivel, en orden aleatorio.
  let took = true;
  while (picked.length < n && took) {
    took = false;
    for (const d of order) {
      if (picked.length === n) break;
      const entry = nextFromDifficulty(d);
      if (entry === undefined) continue;
      took = true;
      if (!seen.has(entry.text)) {
        picked.push(entry);
        seen.add(entry.text);
      }
    }
  }

  // Si falta, completa con el resto del banco.
  for (const entry of shuffle(pool, rng)) {
    if (picked.length === n) break;
    if (!seen.has(entry.text)) {
      picked.push(entry);
      seen.add(entry.text);
    }
  }

  return picked;
}

/** Verdadero si el intento coincide con el texto o con alguna forma aceptada, tras normalizar. */
export function isCorrectGuess(entry: WordEntry, guess: string): boolean {
  const normalized = normalizeGuess(guess);
  return [entry.text, ...(entry.accept ?? [])].some((form) => normalizeGuess(form) === normalized);
}
