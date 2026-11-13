import { useId } from 'react';
import { MinusIcon, PlusIcon } from './icons';

type StepperProps = {
  label: string;
  /** Texto del valor actual, por ejemplo `3 rondas` o `1:20`. */
  valueText: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  /** Solo lectura (invitados): se muestra el valor sin botones. */
  readOnly?: boolean;
};

/** Control de valor con botones − y + de 44 px. */
export function Stepper({
  label,
  valueText,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  readOnly = false,
}: StepperProps) {
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="font-extrabold">
        {label}
      </span>
      {readOnly ? (
        <span className="rounded-xl border-2 border-ink bg-paper px-3 py-1.5 font-black tabular-nums">
          {valueText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDecrease}
            disabled={!canDecrease}
            aria-label={`Menos: ${label}`}
            className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-ink bg-card shadow-pop-sm hover:bg-sol-soft disabled:border-ink-soft disabled:bg-paper-deep disabled:text-ink-soft disabled:shadow-none"
          >
            <MinusIcon />
          </button>
          <output aria-live="polite" className="min-w-[5.5rem] text-center font-black tabular-nums">
            {valueText}
          </output>
          <button
            type="button"
            onClick={onIncrease}
            disabled={!canIncrease}
            aria-label={`Más: ${label}`}
            className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-ink bg-card shadow-pop-sm hover:bg-sol-soft disabled:border-ink-soft disabled:bg-paper-deep disabled:text-ink-soft disabled:shadow-none"
          >
            <PlusIcon />
          </button>
        </span>
      )}
    </div>
  );
}
