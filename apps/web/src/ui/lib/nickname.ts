// Validación de apodo y código de sala en el cliente. Es solo ayuda para el usuario:
// el servidor vuelve a validar todo con Zod (nicknameSchema, roomCodeSchema).

import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, ROOM_CODE_LENGTH } from '@dya/shared';

export type NicknameProblem = 'too_short' | 'too_long' | 'invalid_chars';

// Mismo criterio que el servidor: caracteres de control y de formato (saltos de línea, marcas bidi).
const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/u;

/** Recorta los bordes y colapsa los espacios dobles, igual que `nicknameSchema`. */
export function normalizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function validateNickname(raw: string): NicknameProblem | null {
  const name = normalizeNickname(raw);
  if (name.length < NICKNAME_MIN_LENGTH) return 'too_short';
  if (name.length > NICKNAME_MAX_LENGTH) return 'too_long';
  if (CONTROL_CHARS.test(name)) return 'invalid_chars';
  return null;
}

export function nicknameProblemText(problem: NicknameProblem): string {
  switch (problem) {
    case 'too_short':
      return `Tu apodo necesita al menos ${NICKNAME_MIN_LENGTH} caracteres.`;
    case 'too_long':
      return `Tu apodo puede tener hasta ${NICKNAME_MAX_LENGTH} caracteres.`;
    case 'invalid_chars':
      return 'Tu apodo tiene caracteres que no podemos usar.';
  }
}

/** Mayúsculas, solo A–Z (se ignoran espacios y signos al pegar) y tope de largo. */
export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCodeComplete(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH;
}
