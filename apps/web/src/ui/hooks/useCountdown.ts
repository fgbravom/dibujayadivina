import { useCallback, useSyncExternalStore } from 'react';
import { isUrgent, secondsRemaining } from '../lib/clock';

const TICK_MS = 200;

export type Countdown = {
  /** Segundos que faltan; `null` si la fase no tiene reloj. */
  seconds: number | null;
  /** Últimos 10 segundos. */
  urgent: boolean;
};

/**
 * Cuenta regresiva local a partir de `endsAt` (hora del servidor, ms) y el desfase
 * `serverOffsetMs = serverNow - Date.now()` medido al recibir `room:state`.
 * Se vuelve a calcular desde la hora absoluta en cada tick, así no se desfasa aunque la
 * pestaña quede en segundo plano.
 */
export function useCountdown(endsAt: number | null, serverOffsetMs: number): Countdown {
  const active = endsAt !== null;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};
      const id = setInterval(onChange, TICK_MS);
      return () => clearInterval(id);
    },
    [active],
  );

  const getSnapshot = useCallback(
    () => (endsAt === null ? null : secondsRemaining(endsAt, serverOffsetMs, Date.now())),
    [endsAt, serverOffsetMs],
  );

  const seconds = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { seconds, urgent: isUrgent(seconds) };
}
