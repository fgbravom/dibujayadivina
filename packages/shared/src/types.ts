// Tipos del contrato (PLAN.md sección 4).

import type { StrokeSize, StrokeTool } from './constants.js';

/** Trazo del lienzo en coordenadas lógicas enteras (800 x 600). */
export type Stroke = {
  id: string;
  /** Uno de PALETTE. */
  color: string;
  size: StrokeSize;
  tool: StrokeTool;
  /** [x0, y0, x1, y1, ...] */
  points: number[];
};

export const PHASES = ['LOBBY', 'CHOOSING', 'DRAWING', 'TURN_END', 'GAME_END'] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Jugador visible para toda la sala. `id` es el identificador público (el que viaja en eventos);
 * el `sessionId` secreto del navegador nunca sale del servidor.
 */
export type Player = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  isHost: boolean;
  /** Ya acertó la palabra en el turno actual. */
  guessed: boolean;
};

export type GameSettings = {
  rounds: number;
  drawSeconds: number;
};

export const TURN_END_REASONS = ['time', 'all_guessed', 'drawer_left'] as const;
export type TurnEndReason = (typeof TURN_END_REASONS)[number];

export type TurnEnd = {
  word: string;
  /** Puntos ganados en este turno por jugador (incluye al dibujante). */
  gains: Record<string, number>;
  /** Puntaje acumulado por jugador tras el turno. */
  scores: Record<string, number>;
  reason: TurnEndReason;
};

export type RankingEntry = {
  playerId: string;
  name: string;
  score: number;
  /** Empates comparten posición (1, 1, 3...). */
  rank: number;
};

/** Canal de un mensaje: `all` lo ven todos; `guessed` solo el dibujante y quienes ya adivinaron. */
export const MESSAGE_CHANNELS = ['all', 'guessed'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const ERROR_CODES = [
  'invalid_payload',
  'rate_limited',
  'room_not_found',
  'room_full',
  'name_invalid',
  'name_taken',
  'not_in_room',
  'not_host',
  'not_drawer',
  'wrong_phase',
  'not_enough_players',
  'too_many_strokes',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Foto completa de la sala para quien entra o se reconecta (`room:state`). */
export type RoomState = {
  code: string;
  phase: Phase;
  settings: GameSettings;
  players: Player[];
  hostId: string;
  /** Id del jugador que recibe esta foto. */
  selfId: string;
  drawerId: string | null;
  /** Ronda actual (desde 1); 0 en LOBBY. */
  round: number;
  totalRounds: number;
  /** Palabra enmascarada; null fuera de DRAWING/TURN_END. */
  mask: string | null;
  /** Fin de la fase en curso (hora del servidor, ms); null si la fase no tiene reloj (LOBBY, GAME_END). */
  endsAt: number | null;
  /** Hora del servidor al armar la foto, para calcular el desfase de reloj. */
  serverNow: number;
  /** Historial de trazos del turno en curso (ya con los deshacer aplicados). */
  strokes: Stroke[];
  /** Palabra real: solo la recibe el dibujante en DRAWING; para el resto es null. */
  word: string | null;
  /** Opciones de palabra: solo las recibe el dibujante en CHOOSING; para el resto es null. */
  wordOptions: string[] | null;
  /** Resultado del turno, solo en TURN_END. */
  turnEnd: TurnEnd | null;
  /** Clasificación final, solo en GAME_END. */
  ranking: RankingEntry[] | null;
};
