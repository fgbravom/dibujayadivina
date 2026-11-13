// Lectura de la máscara de la palabra (`maskWord` de @dya/shared) para mostrarla letra por letra.

export type MaskSymbol = {
  char: string;
  /** `true` si es un guion bajo aún sin revelar. */
  hidden: boolean;
  /** Letra o dígito (los signos como `-` se muestran sin casilla). */
  isLetter: boolean;
};

const LETTER = /[\p{L}\p{N}]/u;

/**
 * `maskWord` separa cada carácter con un espacio y deja tres espacios entre palabras
 * (`_ _ _   _ _`). Devuelve una lista de palabras, cada una con sus símbolos.
 */
export function parseMask(mask: string): MaskSymbol[][] {
  return mask
    .trim()
    .split(/\s{2,}/)
    .map((word) =>
      word
        .split(' ')
        .filter((c) => c !== '')
        .map((char) => ({
          char,
          hidden: char === '_',
          isLetter: char === '_' || LETTER.test(char),
        })),
    )
    .filter((word) => word.length > 0);
}

/** Igual que `parseMask`, pero para una palabra completa y visible (la del dibujante o la revelada). */
export function symbolsFromWord(word: string): MaskSymbol[][] {
  return word
    .trim()
    .split(/\s+/)
    .map((w) => Array.from(w).map((char) => ({ char, hidden: false, isLetter: LETTER.test(char) })))
    .filter((w) => w.length > 0);
}

export function letterCount(words: MaskSymbol[][]): number {
  return words.reduce((n, w) => n + w.filter((s) => s.isLetter).length, 0);
}

/** Texto para lectores de pantalla de la máscara. */
export function maskAriaLabel(mask: string): string {
  const words = parseMask(mask);
  const total = letterCount(words);
  const revealed = words.reduce((n, w) => n + w.filter((s) => s.isLetter && !s.hidden).length, 0);
  const base = `Palabra de ${total} ${total === 1 ? 'letra' : 'letras'}`;
  if (revealed === 0) return base;
  const shown = words
    .flat()
    .filter((s) => s.isLetter && !s.hidden)
    .map((s) => s.char)
    .join(', ');
  return `${base}, con ${revealed === 1 ? 'una pista' : `${revealed} pistas`}: ${shown}`;
}
