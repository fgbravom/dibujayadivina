// Foto de la sala para un jugador concreto. La red agrega `code` y `strokes`.

import { maskWord } from '@dya/shared';
import type { Player } from '@dya/shared';
import type { EnginePlayer, EngineSnapshot, GameState, PlayerId } from './types.js';

/** Vista pública de un jugador: nunca incluye el `sessionId`. */
export function toPlayer(state: GameState, p: EnginePlayer): Player {
  const inTurn = state.phase === 'DRAWING' || state.phase === 'TURN_END';
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    connected: p.connected,
    isHost: state.hostId === p.id,
    guessed: inTurn && (state.turn?.guesses.some((g) => g.playerId === p.id) ?? false),
  };
}

/** Palabra enmascarada con las pistas reveladas; null fuera de DRAWING y TURN_END. */
export function currentMask(state: GameState): string | null {
  const word = state.turn?.word;
  if (!word || (state.phase !== 'DRAWING' && state.phase !== 'TURN_END')) return null;
  return maskWord(word.text, state.turn?.revealed ?? []);
}

export function buildSnapshot(state: GameState, viewerId: PlayerId, now: number): EngineSnapshot {
  const turn = state.turn;
  const isDrawer = turn !== null && turn.drawerId === viewerId;
  return {
    phase: state.phase,
    settings: { ...state.settings },
    players: state.players.map((p) => toPlayer(state, p)),
    hostId: state.hostId ?? '',
    selfId: viewerId,
    drawerId: turn?.drawerId ?? null,
    round: state.round,
    totalRounds: state.settings.rounds,
    mask: currentMask(state),
    endsAt: state.deadline,
    serverNow: now,
    word: isDrawer && state.phase === 'DRAWING' ? (turn.word?.text ?? null) : null,
    wordOptions: isDrawer && state.phase === 'CHOOSING' ? turn.options.map((o) => o.text) : null,
    turnEnd: state.phase === 'TURN_END' ? (turn?.result ?? null) : null,
    ranking: state.phase === 'GAME_END' ? (state.ranking ?? null) : null,
  };
}
