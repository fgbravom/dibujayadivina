import type { Player, RankingEntry } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { buildPodium, buildRanking, rankByScore } from './ranking';

function player(id: string, score: number): Player {
  return { id, name: id.toUpperCase(), score, connected: true, isHost: false, guessed: false };
}

describe('rankByScore', () => {
  it('ordena de mayor a menor puntaje', () => {
    const ranked = rankByScore([player('a', 10), player('b', 30), player('c', 20)]);
    expect(ranked.map((r) => r.player.id)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('los empates comparten posición y la siguiente se salta', () => {
    const ranked = rankByScore([
      player('a', 20),
      player('b', 30),
      player('c', 30),
      player('d', 10),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
  });

  it('mantiene el orden de llegada entre empatados y no muta la entrada', () => {
    const input = [player('x', 0), player('y', 0), player('z', 0)];
    const ranked = rankByScore(input);
    expect(ranked.map((r) => r.player.id)).toEqual(['x', 'y', 'z']);
    expect(ranked.every((r) => r.rank === 1)).toBe(true);
    expect(input.map((p) => p.id)).toEqual(['x', 'y', 'z']);
  });

  it('acepta una sala vacía', () => {
    expect(rankByScore([])).toEqual([]);
  });
});

describe('buildRanking', () => {
  it('calcula posiciones compartidas', () => {
    const ranking = buildRanking([
      { id: 'a', name: 'Ana', score: 10 },
      { id: 'b', name: 'Beto', score: 30 },
      { id: 'c', name: 'Caro', score: 30 },
    ]);
    expect(ranking.map((r) => [r.name, r.rank])).toEqual([
      ['Beto', 1],
      ['Caro', 1],
      ['Ana', 3],
    ]);
  });
});

function entry(name: string, score: number, rank: number): RankingEntry {
  return { playerId: name.toLowerCase(), name, score, rank };
}

describe('buildPodium', () => {
  it('ordena el podio 2º, 1º, 3º y deja el resto aparte', () => {
    const podium = buildPodium([
      entry('Ana', 50, 1),
      entry('Beto', 40, 2),
      entry('Caro', 30, 3),
      entry('Dani', 20, 4),
      entry('Eli', 10, 5),
    ]);
    expect(podium.places.map((p) => p.place)).toEqual([2, 1, 3]);
    expect(podium.rest.map((r) => r.name)).toEqual(['Dani', 'Eli']);
  });

  it('con empate en el primer lugar no hay segundo lugar', () => {
    const podium = buildPodium([
      entry('Ana', 50, 1),
      entry('Beto', 50, 1),
      entry('Caro', 30, 3),
      entry('Dani', 20, 4),
    ]);
    expect(podium.places.map((p) => p.place)).toEqual([1, 3]);
    expect(podium.places[0]?.entries.map((e) => e.name)).toEqual(['Ana', 'Beto']);
    expect(podium.rest.map((r) => r.name)).toEqual(['Dani']);
  });

  it('con empate en el segundo lugar agrupa a los empatados', () => {
    const podium = buildPodium([
      entry('Ana', 50, 1),
      entry('Beto', 40, 2),
      entry('Caro', 40, 2),
      entry('Dani', 10, 4),
    ]);
    expect(podium.places.map((p) => p.place)).toEqual([2, 1]);
    expect(podium.places[0]?.entries).toHaveLength(2);
    expect(podium.rest).toHaveLength(1);
  });

  it('funciona con dos jugadores y con uno', () => {
    expect(
      buildPodium([entry('Ana', 5, 1), entry('Beto', 3, 2)]).places.map((p) => p.place),
    ).toEqual([2, 1]);
    expect(buildPodium([entry('Ana', 5, 1)]).places.map((p) => p.place)).toEqual([1]);
    expect(buildPodium([])).toEqual({ places: [], rest: [] });
  });

  it('ordena aunque el ranking llegue desordenado', () => {
    const podium = buildPodium([entry('Caro', 30, 3), entry('Ana', 50, 1), entry('Beto', 40, 2)]);
    expect(podium.places.map((p) => p.entries[0]?.name)).toEqual(['Beto', 'Ana', 'Caro']);
  });
});
