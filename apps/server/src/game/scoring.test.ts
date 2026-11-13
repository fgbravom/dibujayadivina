import { describe, expect, it } from 'vitest';
import { computeGains, drawerPoints, guesserPoints, ranking } from './scoring.js';
import type { EnginePlayer, TurnState } from './types.js';

function player(id: string, score = 0): EnginePlayer {
  return {
    id,
    sessionId: `session-${id}`,
    name: id.toUpperCase(),
    score,
    connected: true,
    connId: `conn-${id}`,
    disconnectedAt: null,
  };
}

function turn(drawerId: string, guessers: string[]): TurnState {
  return {
    drawerId,
    options: [],
    word: { text: 'huemul' },
    answers: ['huemul'],
    revealed: [],
    pendingHints: [],
    guesses: guessers.map((playerId, i) => ({ playerId, points: guesserPoints(i) })),
    result: null,
  };
}

describe('guesserPoints', () => {
  it('da 10, 8, 6, 4 y el último valor para los siguientes', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(guesserPoints)).toEqual([10, 8, 6, 4, 4, 4, 4]);
  });
});

describe('drawerPoints', () => {
  it('es 0 sin aciertos, 10 con uno y suma 1 por cada acierto extra', () => {
    expect([0, 1, 2, 3, 5].map(drawerPoints)).toEqual([0, 10, 11, 12, 14]);
  });
});

describe('computeGains', () => {
  const players = [player('p1'), player('p2'), player('p3')];

  it('reparte adivinadores y dibujante', () => {
    const gains = computeGains(turn('p1', ['p3', 'p2']), players, 'all_guessed');
    expect(gains).toEqual({ p1: 11, p2: 8, p3: 10 });
  });

  it('da 0 a todos si el dibujante se fue', () => {
    const gains = computeGains(turn('p1', ['p2', 'p3']), players, 'drawer_left');
    expect(gains).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('descarta las ganancias de quien ya no está, pero su acierto cuenta para el dibujante', () => {
    const gains = computeGains(turn('p1', ['gone', 'p2']), players, 'time');
    expect(gains).toEqual({ p1: 11, p2: 8, p3: 0 });
    expect(gains).not.toHaveProperty('gone');
  });
});

describe('ranking', () => {
  it('ordena por puntaje y empata puestos (1, 1, 3)', () => {
    const r = ranking([player('a', 5), player('b', 9), player('c', 9), player('d', 2)]);
    expect(r.map((e) => [e.playerId, e.rank])).toEqual([
      ['b', 1],
      ['c', 1],
      ['a', 3],
      ['d', 4],
    ]);
  });

  it('desempata por orden de llegada', () => {
    const r = ranking([player('a', 4), player('b', 4), player('c', 4)]);
    expect(r.map((e) => e.playerId)).toEqual(['a', 'b', 'c']);
    expect(r.every((e) => e.rank === 1)).toBe(true);
  });
});
