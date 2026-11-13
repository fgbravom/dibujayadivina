// Orden y empates del puntaje. El servidor manda el ranking final (`RankingEntry`);
// aquí solo se ordena y se agrupa para mostrarlo.

import type { Player, RankingEntry } from '@dya/shared';

export type RankedPlayer = { player: Player; rank: number };

/**
 * Jugadores de mayor a menor puntaje. El orden entre empatados se mantiene (el de llegada)
 * y comparten posición: 1, 1, 3...
 */
export function rankByScore(players: readonly Player[]): RankedPlayer[] {
  const sorted = players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => b.player.score - a.player.score || a.index - b.index);
  return sorted.map(({ player }) => {
    const firstWithScore = sorted.findIndex((s) => s.player.score === player.score);
    return { player, rank: firstWithScore + 1 };
  });
}

/** Arma un ranking con posiciones compartidas. Lo usa la vista previa; en juego lo manda el servidor. */
export function buildRanking(
  players: readonly Pick<Player, 'id' | 'name' | 'score'>[],
): RankingEntry[] {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'),
  );
  return sorted.map((p) => ({
    playerId: p.id,
    name: p.name,
    score: p.score,
    rank: sorted.findIndex((s) => s.score === p.score) + 1,
  }));
}

export type PodiumPlace = { place: 1 | 2 | 3; entries: RankingEntry[] };

export type Podium = {
  /** Lugares ocupados, en orden visual: 2º, 1º, 3º (los que no existan por empates se omiten). */
  places: PodiumPlace[];
  /** Del 4º lugar en adelante, de mejor a peor. */
  rest: RankingEntry[];
};

/**
 * Agrupa el ranking en podio. Con empates, varios jugadores comparten un lugar y el siguiente
 * lugar se salta (1, 1, 3): no habrá segundo lugar.
 */
export function buildPodium(ranking: readonly RankingEntry[]): Podium {
  const sorted = [...ranking].sort(
    (a, b) => a.rank - b.rank || b.score - a.score || a.name.localeCompare(b.name, 'es'),
  );
  const byPlace = new Map<1 | 2 | 3, RankingEntry[]>();
  const rest: RankingEntry[] = [];
  for (const entry of sorted) {
    if (entry.rank === 1 || entry.rank === 2 || entry.rank === 3) {
      const list = byPlace.get(entry.rank) ?? [];
      list.push(entry);
      byPlace.set(entry.rank, list);
    } else {
      rest.push(entry);
    }
  }
  const places = ([2, 1, 3] as const)
    .filter((place) => byPlace.has(place))
    .map((place) => ({ place, entries: byPlace.get(place) ?? [] }));
  return { places, rest };
}
