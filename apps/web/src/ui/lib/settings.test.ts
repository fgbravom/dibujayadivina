import {
  MAX_DRAW_SECONDS,
  MAX_ROUNDS,
  MIN_DRAW_SECONDS,
  MIN_ROUNDS,
  type GameSettings,
} from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { clampDrawSeconds, clampRounds, stepDrawSeconds, stepRounds } from './settings';

const base: GameSettings = { rounds: 3, drawSeconds: 80 };

describe('stepRounds', () => {
  it('suma y resta de a una ronda sin tocar el tiempo', () => {
    expect(stepRounds(base, 1)).toEqual({ rounds: 4, drawSeconds: 80 });
    expect(stepRounds(base, -1)).toEqual({ rounds: 2, drawSeconds: 80 });
  });

  it('no sale del rango', () => {
    expect(stepRounds({ ...base, rounds: MAX_ROUNDS }, 1).rounds).toBe(MAX_ROUNDS);
    expect(stepRounds({ ...base, rounds: MIN_ROUNDS }, -1).rounds).toBe(MIN_ROUNDS);
  });
});

describe('stepDrawSeconds', () => {
  it('cambia de a 10 segundos sin tocar las rondas', () => {
    expect(stepDrawSeconds(base, 1)).toEqual({ rounds: 3, drawSeconds: 90 });
    expect(stepDrawSeconds(base, -1)).toEqual({ rounds: 3, drawSeconds: 70 });
  });

  it('no sale del rango', () => {
    expect(stepDrawSeconds({ ...base, drawSeconds: MAX_DRAW_SECONDS }, 1).drawSeconds).toBe(
      MAX_DRAW_SECONDS,
    );
    expect(stepDrawSeconds({ ...base, drawSeconds: MIN_DRAW_SECONDS }, -1).drawSeconds).toBe(
      MIN_DRAW_SECONDS,
    );
  });
});

describe('clamp', () => {
  it('acota y redondea', () => {
    expect(clampRounds(0)).toBe(MIN_ROUNDS);
    expect(clampRounds(99)).toBe(MAX_ROUNDS);
    expect(clampRounds(2.6)).toBe(3);
    expect(clampDrawSeconds(1)).toBe(MIN_DRAW_SECONDS);
    expect(clampDrawSeconds(999)).toBe(MAX_DRAW_SECONDS);
  });
});
