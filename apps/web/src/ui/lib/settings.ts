// Ajustes de partida que edita el anfitrión: pasos y límites según las constantes del contrato.

import {
  MAX_DRAW_SECONDS,
  MAX_ROUNDS,
  MIN_DRAW_SECONDS,
  MIN_ROUNDS,
  type GameSettings,
} from '@dya/shared';

export const ROUNDS_STEP = 1;
export const DRAW_SECONDS_STEP = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampRounds(rounds: number): number {
  return clamp(Math.round(rounds), MIN_ROUNDS, MAX_ROUNDS);
}

export function clampDrawSeconds(seconds: number): number {
  return clamp(Math.round(seconds), MIN_DRAW_SECONDS, MAX_DRAW_SECONDS);
}

export function stepRounds(settings: GameSettings, direction: 1 | -1): GameSettings {
  return { ...settings, rounds: clampRounds(settings.rounds + direction * ROUNDS_STEP) };
}

export function stepDrawSeconds(settings: GameSettings, direction: 1 | -1): GameSettings {
  return {
    ...settings,
    drawSeconds: clampDrawSeconds(settings.drawSeconds + direction * DRAW_SECONDS_STEP),
  };
}
