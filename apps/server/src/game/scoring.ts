// Puntaje, ganancias y ranking (docs/motor-reglas.md sección 7).

import { DRAWER_EXTRA_GUESS_SCORE, DRAWER_FIRST_GUESS_SCORE, GUESSER_SCORES } from '@dya/shared';
import type { RankingEntry, TurnEndReason } from '@dya/shared';
import type { EnginePlayer, TurnState } from './types.js';

/** Puntos del adivinador según su posición de acierto (0 es el primero). */
export function guesserPoints(position: number): number {
  const i = Math.min(position, GUESSER_SCORES.length - 1);
  return GUESSER_SCORES[i] ?? 0;
}

/** Puntos del dibujante según cuántos acertaron (incluye a quien acertó y se fue, no a quien llegó tarde). */
export function drawerPoints(guessCount: number): number {
  if (guessCount <= 0) return 0;
  return DRAWER_FIRST_GUESS_SCORE + DRAWER_EXTRA_GUESS_SCORE * (guessCount - 1);
}

/**
 * Ganancias del turno por jugador presente (las de quien ya no está se descartan).
 * Si el dibujante se fue, nadie puntúa.
 */
export function computeGains(
  turn: TurnState,
  players: readonly EnginePlayer[],
  reason: TurnEndReason,
): Record<string, number> {
  const gains: Record<string, number> = {};
  for (const p of players) gains[p.id] = 0;
  if (reason === 'drawer_left') return gains;

  for (const g of turn.guesses) {
    if (g.playerId in gains) gains[g.playerId] = (gains[g.playerId] ?? 0) + g.points;
  }
  if (turn.drawerId in gains) {
    // Solo cuentan los aciertos de quienes ya estaban al empezar a dibujar.
    const counted = turn.guesses.filter((g) => turn.presentIds.includes(g.playerId)).length;
    gains[turn.drawerId] = (gains[turn.drawerId] ?? 0) + drawerPoints(counted);
  }
  return gains;
}

/** Puntaje descendente; en empate, orden de llegada. Los empates comparten puesto (1, 1, 3). */
export function ranking(players: readonly EnginePlayer[]): RankingEntry[] {
  const sorted = [...players].sort((a, b) => b.score - a.score); // sort es estable
  return sorted.map((p) => ({
    playerId: p.id,
    name: p.name,
    score: p.score,
    rank: 1 + players.filter((q) => q.score > p.score).length,
  }));
}
