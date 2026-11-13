// Entorno de trabajo de una reducción: la copia mutable del estado, el contexto y los efectos.

import type { ErrorCode, ServerToClientEvents } from '@dya/shared';
import type {
  Effect,
  EngineContext,
  EngineEvent,
  EnginePlayer,
  GameState,
  PlayerId,
  Recipient,
} from './types.js';

export interface Env {
  state: GameState;
  ctx: EngineContext;
  fx: Effect[];
}

/** Resultado de manejar una acción: vacío si todo salió bien. */
export interface Outcome {
  error?: ErrorCode;
  playerId?: PlayerId;
}

export const toRoom: Recipient = { kind: 'room' };
export const toOne = (playerId: PlayerId): Recipient => ({ kind: 'player', playerId });
export const toRoomExcept = (playerId: PlayerId): Recipient => ({ kind: 'roomExcept', playerId });
export const toMany = (playerIds: PlayerId[]): Recipient => ({ kind: 'players', playerIds });

export function emit<E extends EngineEvent>(
  env: Env,
  to: Recipient,
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0],
): void {
  env.fx.push({ type: 'emit', to, event, payload } as Effect);
}

export function getPlayer(state: GameState, id: PlayerId): EnginePlayer | undefined {
  return state.players.find((p) => p.id === id);
}
