import { CHOOSE_SECONDS } from '@dya/shared';
import { Avatar } from './Avatar';
import { PencilIcon } from './icons';

type ChoosingPanelProps = {
  /** `true` si quien mira es el dibujante: ve las opciones. El resto solo ve a quién se espera. */
  isDrawer: boolean;
  drawerId: string | null;
  drawerName: string;
  /** Opciones de palabra (solo las recibe el dibujante); `null` si aún no llegan. */
  wordOptions: readonly string[] | null;
  onChoose: (index: number) => void;
};

/** Fase CHOOSING, sobre el lienzo. */
export function ChoosingPanel({
  isDrawer,
  drawerId,
  drawerName,
  wordOptions,
  onChoose,
}: ChoosingPanelProps) {
  if (isDrawer) {
    return (
      <div
        data-testid="choosing-drawer"
        className="flex h-full flex-col items-center justify-center gap-2.5 overflow-y-auto p-3 text-center"
      >
        <h2 className="flex items-center gap-2 text-xl font-black">
          <PencilIcon /> ¡Te toca dibujar!
        </h2>
        <p className="text-sm font-bold text-ink-soft">Elige una palabra</p>
        {wordOptions === null ? (
          <p role="status" className="font-extrabold">
            Buscando palabras…
          </p>
        ) : (
          <ul className="flex w-full max-w-xs flex-col gap-2">
            {wordOptions.map((word, index) => (
              <li key={`${index}-${word}`}>
                <button
                  type="button"
                  onClick={() => onChoose(index)}
                  data-testid={`word-option-${index}`}
                  className="min-h-11 w-full rounded-xl border-2 border-ink bg-sol px-4 py-2 text-lg font-black shadow-pop hover:brightness-95 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                >
                  {word}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs font-bold text-ink-soft">
          Tienes {CHOOSE_SECONDS} segundos. Si no eliges, te asignamos la primera.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="choosing-guesser"
      role="status"
      className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
    >
      {drawerId && <Avatar id={drawerId} name={drawerName} />}
      <h2 className="text-xl font-black">{drawerName} está eligiendo una palabra…</h2>
      <p className="text-sm font-bold text-ink-soft">Prepara el ojo: ya casi parte el dibujo.</p>
    </div>
  );
}
