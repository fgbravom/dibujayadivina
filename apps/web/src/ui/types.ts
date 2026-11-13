// Tipos propios de la capa de pantallas.

import type { MessageChannel } from '@dya/shared';

/** Tono de un aviso de sistema en la lista de mensajes. */
export type SystemTone = 'info' | 'join' | 'leave' | 'guessed' | 'close';

/**
 * Ítem de la lista unificada de mensajes. Quien conecte el store arma estos ítems a partir de
 * los eventos (ver `lib/feed.ts`); `id` debe ser único y estable (es la `key` de React).
 */
export type FeedItem =
  | {
      id: string;
      kind: 'message';
      playerId: string;
      /** Apodo ya resuelto del jugador que escribió. */
      name: string;
      text: string;
      /** `guessed`: solo lo ven el dibujante y quienes ya adivinaron. */
      channel: MessageChannel;
      isSelf: boolean;
    }
  | {
      id: string;
      kind: 'system';
      tone: SystemTone;
      text: string;
    };

/** Qué hace lo que se escribe en el campo de texto (sección 2, "Un solo campo de texto"). */
export type ComposerMode = 'guess' | 'guessed' | 'chat';
