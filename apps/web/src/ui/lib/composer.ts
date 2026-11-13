// Qué significa lo que se escribe en el campo único de texto (PLAN.md sección 2).

import type { Phase } from '@dya/shared';
import type { ComposerMode } from '../types';

/**
 * - `guess`: en DRAWING y aún sin adivinar, lo que escribes es un intento y lo ven todos.
 * - `guessed`: en DRAWING, si ya adivinaste o eres el dibujante, solo lo ven el dibujante y
 *   quienes ya adivinaron.
 * - `chat`: el resto de las fases (LOBBY, TURN_END, GAME_END) es chat normal. CHOOSING no tiene
 *   palabra aún, así que se trata como chat normal (supuesto; el plan no lo menciona).
 */
export function getComposerMode(input: {
  phase: Phase;
  isDrawer: boolean;
  hasGuessed: boolean;
}): ComposerMode {
  if (input.phase !== 'DRAWING') return 'chat';
  return input.isDrawer || input.hasGuessed ? 'guessed' : 'guess';
}

export const COMPOSER_TEXT: Record<ComposerMode, { placeholder: string; label: string }> = {
  guess: { placeholder: 'Escribe tu respuesta', label: 'Tu respuesta' },
  guessed: {
    placeholder: 'Solo adivinadores',
    label: 'Mensaje para quienes ya adivinaron',
  },
  chat: { placeholder: 'Escribe un mensaje', label: 'Mensaje de chat' },
};

/** Texto a enviar, o `null` si no hay nada que mandar. */
export function prepareMessage(raw: string, maxLength: number): string | null {
  const text = raw.trim().slice(0, maxLength);
  return text === '' ? null : text;
}
