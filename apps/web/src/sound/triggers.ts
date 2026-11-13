// Qué efecto corresponde a cada evento del servidor y a cada segundo del reloj. Funciones puras:
// no tocan Web Audio ni el DOM, así que se prueban sin navegador. No repiten reglas del juego:
// solo miran lo que ya dice el evento y la foto de la sala previa al evento.

import type { RoomState } from '@dya/shared';
import type { ServerEvent } from '../state/session';
import type { SoundId } from './effects';

/**
 * Efecto de un evento nuevo del servidor, o `null` si no suena nada. `room` es la foto previa al
 * evento. `room:state` (entrar o reconectar) nunca suena: la foto es estado, no un hecho nuevo.
 */
export function soundForEvent(room: RoomState | null, event: ServerEvent): SoundId | null {
  if (!room) return null;

  switch (event.type) {
    case 'guess:correct':
      return event.payload.playerId === room.selfId ? 'guessSelf' : 'guessOther';

    case 'guess:close':
      return 'close';

    case 'turn:choosing':
      return event.payload.drawerId === room.selfId ? 'yourTurn' : null;

    case 'turn:start':
      return 'turnStart';

    case 'turn:end':
      return room.players.some((p) => p.guessed && p.id !== room.drawerId)
        ? 'turnEnd'
        : 'turnEndEmpty';

    case 'game:end':
      return 'gameEnd';

    case 'player:joined':
      // Ni uno mismo ni quien vuelve tras una reconexión (ya estaba en la lista).
      return event.payload.id !== room.selfId &&
        !room.players.some((p) => p.id === event.payload.id)
        ? 'playerJoin'
        : null;

    case 'player:left':
      return event.payload.id !== room.selfId && room.players.some((p) => p.id === event.payload.id)
        ? 'playerLeave'
        : null;

    case 'message:new':
      return event.payload.playerId === room.selfId ? null : 'chat';

    default:
      return null;
  }
}

/** Los tics suenan en cada uno de los últimos segundos (10, 9, ... 1) del turno de dibujo. */
export const TICK_SECONDS = 10;

export type TickState = {
  /** Último segundo que sonó dentro del turno actual; `null` si aún no suena ninguno. */
  last: number | null;
};

/**
 * Paso del reloj de tics. `seconds` son los segundos que faltan (como en `useCountdown`). Suena
 * solo en `DRAWING` (ni al elegir palabra ni en la pausa) y una sola vez por segundo, aunque se
 * consulte varias veces dentro del mismo segundo.
 */
export function nextTick(
  phase: RoomState['phase'] | null,
  seconds: number | null,
  state: TickState,
): { play: boolean; state: TickState } {
  if (phase !== 'DRAWING' || seconds === null || seconds < 1 || seconds > TICK_SECONDS) {
    return { play: false, state: state.last === null ? state : { last: null } };
  }
  if (seconds === state.last) return { play: false, state };
  return { play: true, state: { last: seconds } };
}
