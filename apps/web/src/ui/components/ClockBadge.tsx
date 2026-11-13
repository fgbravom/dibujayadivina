import { URGENT_SECONDS, clockLabel, formatClock } from '../lib/clock';
import { ClockIcon } from './icons';

type ClockBadgeProps = {
  /** Segundos restantes; `null` si no hay reloj (muestra un guion). */
  seconds: number | null;
  urgent: boolean;
  className?: string;
};

/**
 * Reloj de la fase. No se anuncia cada segundo: solo se avisa una vez, a los últimos 10 s,
 * mediante una región `aria-live` oculta.
 */
export function ClockBadge({ seconds, urgent, className = '' }: ClockBadgeProps) {
  const tone = urgent
    ? 'animate-urgent border-ink bg-copihue text-white'
    : 'border-ink bg-card text-ink';
  return (
    <div
      role="timer"
      aria-label={
        seconds === null ? 'Sin límite de tiempo' : `Tiempo restante: ${clockLabel(seconds)}`
      }
      data-testid="clock"
      data-urgent={urgent}
      className={`inline-flex min-w-[4.25rem] shrink-0 items-center justify-center gap-1 rounded-xl border-2 px-2 py-1 text-lg font-black tabular-nums shadow-pop-sm ${tone} ${className}`}
    >
      <ClockIcon className="hidden sm:block" />
      <span aria-hidden="true">{seconds === null ? '–:––' : formatClock(seconds)}</span>
      <span aria-live="polite" className="sr-only">
        {seconds === URGENT_SECONDS ? `Quedan ${URGENT_SECONDS} segundos` : ''}
      </span>
    </div>
  );
}
