// Presentación del resultado de un turno (`TurnEnd`).

import type { Player, TurnEnd, TurnEndReason } from '@dya/shared';

export function turnEndReasonText(reason: TurnEndReason): string {
  switch (reason) {
    case 'time':
      return 'Se acabó el tiempo';
    case 'all_guessed':
      return '¡Todos adivinaron!';
    case 'drawer_left':
      return 'Quien dibujaba se desconectó: nadie suma puntos en este turno';
  }
}

export type GainRow = { playerId: string; name: string; gain: number; isDrawer: boolean };

/**
 * Puntos ganados en el turno por cada jugador presente, de mayor a menor (a igual puntaje,
 * por apodo). Los jugadores que ya salieron se omiten.
 */
export function buildGainRows(
  players: readonly Player[],
  turnEnd: Pick<TurnEnd, 'gains'>,
  drawerId: string | null,
): GainRow[] {
  return players
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      gain: turnEnd.gains[p.id] ?? 0,
      isDrawer: p.id === drawerId,
    }))
    .sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name, 'es'));
}
