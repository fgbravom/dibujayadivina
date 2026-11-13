// Traducción de ErrorCode a texto de interfaz (español de Chile).

import {
  ERROR_CODES,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  type ErrorCode,
} from '@dya/shared';

/** Es un `Record` completo: si el contrato agrega un código, TypeScript obliga a traducirlo. */
const MESSAGES: Record<ErrorCode, string> = {
  invalid_payload: 'Algo salió raro con lo que enviaste. Intenta de nuevo.',
  rate_limited: 'Vas muy rápido. Espera un momentito e intenta otra vez.',
  room_not_found: 'No encontramos esa sala. Revisa el código o pídele el enlace a quien la creó.',
  room_full: `Esa sala ya está llena (máximo ${MAX_PLAYERS} jugadores).`,
  name_invalid: `Ese apodo no sirve. Usa entre ${NICKNAME_MIN_LENGTH} y ${NICKNAME_MAX_LENGTH} caracteres.`,
  name_taken: 'Ya hay alguien con ese apodo en la sala. Elige otro.',
  not_in_room: 'No estás dentro de una sala. Vuelve al inicio para entrar a una.',
  not_host: 'Solo el anfitrión puede hacer eso.',
  not_drawer: 'Solo quien está dibujando puede hacer eso.',
  wrong_phase: 'Eso no se puede hacer en este momento del juego.',
  not_enough_players: `Faltan jugadores: se necesitan al menos ${MIN_PLAYERS_TO_START} para empezar.`,
  too_many_strokes: 'Este dibujo ya tiene demasiados trazos. Borra algo para seguir.',
  internal: 'Tuvimos un problema de nuestro lado. Intenta de nuevo en unos segundos.',
};

export function errorMessage(code: ErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.internal;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
