// Store de Zustand: lo que la interfaz lee. Lo escribe el cliente de sockets (`client.ts`).

import type { ErrorCode } from '@dya/shared';
import { create } from 'zustand';
import { initialSession, type SessionState } from './session';

/**
 * `connecting`: abriendo el primer socket. `connected`: hay conexión. `disconnected`: se cayó y el
 * navegador está reintentando (o el servidor cerró esta conexión, ver `takenOver`).
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type GameStore = {
  status: ConnectionStatus;
  /** El servidor cerró este socket porque la misma sesión se abrió en otra pestaña. */
  takenOver: boolean;
  /** Se recargó la página dentro de una sala y se está volviendo a entrar. */
  resuming: boolean;
  /** Hay un `room:create` / `room:join` esperando respuesta. */
  busy: boolean;
  nickname: string;
  /** Código de la ruta `/sala/CODIGO` cuando aún no se está dentro de una sala. */
  inviteCode: string | null;
  /** Error de `room:create` / `room:join`, para la pantalla de inicio. */
  homeError: ErrorCode | null;
  /** Último `system:error` relevante, para la sala. */
  roomError: ErrorCode | null;
  session: SessionState;
  /** Versión del cliente publicada cuando difiere de la que corre; `null` si esta pestaña está al día. */
  newVersion: string | null;
  /** Se cerró el aviso de versión nueva (vuelve a salir en la siguiente comprobación). */
  updateDismissed: boolean;
};

export const useGameStore = create<GameStore>()(() => ({
  status: 'connecting',
  takenOver: false,
  resuming: false,
  busy: false,
  nickname: '',
  inviteCode: null,
  homeError: null,
  roomError: null,
  session: initialSession,
  newVersion: null,
  updateDismissed: false,
}));
