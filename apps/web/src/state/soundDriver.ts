// Une los sonidos con el estado: arranca el desbloqueo del audio y el reloj de tics. Los efectos de
// eventos del servidor los dispara `client.ts` con `soundForEvent` (ver `sound/triggers.ts`).

import { secondsRemaining } from '../ui/lib/clock';
import { installAudioUnlock, nextTick, playSound, type TickState } from '../sound';
import { useGameStore } from './store';

/** Igual que `useCountdown`: se recalcula desde la hora absoluta, así no se desfasa. */
const TICK_POLL_MS = 200;

/** Una sola vez: oyentes de desbloqueo del audio y reloj de tics (solo corre mientras se dibuja). */
export function startSoundDriver(): void {
  installAudioUnlock();

  let timer: ReturnType<typeof setInterval> | null = null;
  let tickState: TickState = { last: null };

  const poll = () => {
    const { room, serverOffsetMs } = useGameStore.getState().session;
    const seconds =
      room?.endsAt == null ? null : secondsRemaining(room.endsAt, serverOffsetMs, Date.now());
    const step = nextTick(room?.phase ?? null, seconds, tickState);
    tickState = step.state;
    // En segundo plano el reloj sigue pero no se oye: así no se acumulan tics al volver.
    if (step.play && document.visibilityState === 'visible') playSound('tick');
  };

  const sync = () => {
    const drawing = useGameStore.getState().session.room?.phase === 'DRAWING';
    if (drawing && timer === null) {
      tickState = { last: null };
      timer = setInterval(poll, TICK_POLL_MS);
      poll();
    } else if (!drawing && timer !== null) {
      clearInterval(timer);
      timer = null;
      tickState = { last: null };
    }
  };

  useGameStore.subscribe(sync);
  sync();
}
