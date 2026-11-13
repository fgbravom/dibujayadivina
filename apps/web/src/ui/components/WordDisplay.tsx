import { maskAriaLabel, parseMask, symbolsFromWord, type MaskSymbol } from '../lib/mask';

type WordDisplayProps =
  | { mask: string; word?: never; className?: string }
  | { word: string; mask?: never; className?: string };

/**
 * La palabra letra por letra: casillas con subrayado para las letras ocultas, la letra a la vista
 * para las reveladas. Con `mask` muestra la máscara del servidor; con `word`, la palabra completa
 * (la del dibujante o la revelada al terminar el turno). Las palabras largas se parten en líneas
 * entre palabras, nunca dentro de una.
 */
export function WordDisplay({ mask, word, className = '' }: WordDisplayProps) {
  const words: MaskSymbol[][] = mask !== undefined ? parseMask(mask) : symbolsFromWord(word ?? '');
  const label = mask !== undefined ? maskAriaLabel(mask) : (word ?? '');
  return (
    <div
      role="img"
      aria-label={label}
      data-testid="word-display"
      className={`flex flex-wrap items-end justify-center gap-x-3 gap-y-1 ${className}`}
    >
      {words.map((w, wi) => (
        <span key={wi} aria-hidden="true" className="inline-flex gap-[3px]">
          {w.map((s, si) => (
            <span
              key={si}
              className={`inline-flex h-[1.35em] min-w-[0.8em] items-end justify-center text-center font-black uppercase leading-none ${
                s.isLetter ? 'border-b-[3px] border-ink' : 'min-w-[0.5em]'
              }`}
            >
              {s.hidden ? ' ' : s.char}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
