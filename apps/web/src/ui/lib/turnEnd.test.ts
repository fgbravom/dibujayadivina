import { TURN_END_REASONS, type Player } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { buildGainRows, turnEndReasonText } from './turnEnd';

function player(id: string, name: string): Player {
  return { id, name, score: 0, connected: true, isHost: false, guessed: false };
}

describe('turnEndReasonText', () => {
  it('tiene un texto distinto para cada causa', () => {
    const texts = TURN_END_REASONS.map(turnEndReasonText);
    expect(new Set(texts).size).toBe(TURN_END_REASONS.length);
  });
});

describe('buildGainRows', () => {
  const players = [
    player('a', 'Ana'),
    player('b', 'Beto'),
    player('c', 'Caro'),
    player('d', 'Dani'),
  ];

  it('ordena por puntos del turno y desempata por apodo', () => {
    const rows = buildGainRows(players, { gains: { a: 12, b: 10, c: 10 } }, 'a');
    expect(rows.map((r) => [r.name, r.gain])).toEqual([
      ['Ana', 12],
      ['Beto', 10],
      ['Caro', 10],
      ['Dani', 0],
    ]);
    expect(rows[0]?.isDrawer).toBe(true);
  });

  it('si nadie puntúa, todos quedan en cero', () => {
    const rows = buildGainRows(players, { gains: {} }, 'a');
    expect(rows.every((r) => r.gain === 0)).toBe(true);
  });

  it('omite a quienes ya no están en la sala', () => {
    const rows = buildGainRows(players, { gains: { zz: 8 } }, null);
    expect(rows.map((r) => r.playerId)).not.toContain('zz');
  });
});
