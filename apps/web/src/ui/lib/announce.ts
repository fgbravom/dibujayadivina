// Texto que los lectores de pantalla anuncian al cambiar de turno o de fase. Es la única voz de
// esos cambios: el chat y los aciertos ("Fulano adivinó") ya los anuncia la lista de mensajes.

import type { Phase } from '@dya/shared';
import { letterCount, parseMask } from './mask';

export type TurnAnnouncementInput = {
  phase: Phase;
  round: number;
  totalRounds: number;
  isDrawer: boolean;
  drawerName: string;
  /** Palabra a la vista: la real para el dibujante, la revelada en TURN_END. */
  word: string | null;
  mask: string | null;
  /** Motivo del fin de turno ya redactado (ver `turnEndReasonText`). */
  endReason: string | null;
};

/**
 * Cambia solo al cambiar de fase o de turno (nunca con cada pista ni cada segundo), así el aviso
 * se anuncia una vez por cambio.
 */
export function turnAnnouncement(input: TurnAnnouncementInput): string {
  const { phase, round, totalRounds, isDrawer, drawerName, word, mask, endReason } = input;
  const roundText = `Ronda ${round} de ${totalRounds}.`;
  switch (phase) {
    case 'CHOOSING':
      return isDrawer
        ? `${roundText} Te toca dibujar: elige una palabra.`
        : `${roundText} ${drawerName} está eligiendo una palabra.`;
    case 'DRAWING': {
      if (isDrawer) return word ? `Dibuja: ${word}.` : 'Dibuja la palabra.';
      const letters = mask ? letterCount(parseMask(mask)) : 0;
      const hint =
        letters > 0 ? ` Palabra de ${letters} ${letters === 1 ? 'letra' : 'letras'}.` : '';
      return `${drawerName} dibuja.${hint} ¡Adivina!`;
    }
    case 'TURN_END':
      return [word ? `La palabra era ${word}.` : 'Fin del turno.', endReason ?? '']
        .filter(Boolean)
        .join(' ');
    default:
      return '';
  }
}
