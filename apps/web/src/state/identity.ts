// Identidad del navegador: `sessionId` (para que el servidor reconozca al jugador al reconectar),
// apodo y sala actual. Todo acceso al almacenamiento va con try/catch: en modo privado o con el
// almacenamiento bloqueado puede lanzar, y el juego debe seguir funcionando sin él.

import { ERROR_CODES, sessionIdSchema, type ErrorCode } from '@dya/shared';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEYS = {
  sessionId: 'dya.sessionId',
  nickname: 'dya.nickname',
  room: 'dya.room',
  reloadedFor: 'dya.reloadedFor',
  pendingHomeError: 'dya.pendingHomeError',
} as const;

/** Sala a la que se pertenece: sirve para volver a entrar tras recargar la página. */
export type SavedRoom = { code: string; name: string };

/** `localStorage` o `sessionStorage`, o `null` si el navegador no los deja usar. */
export function browserStorage(kind: 'local' | 'session'): KeyValueStorage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(storage: KeyValueStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: KeyValueStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Sin almacenamiento: se sigue sin recordar.
  }
}

function remove(storage: KeyValueStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Sin almacenamiento: nada que borrar.
  }
}

/**
 * Id aleatorio de 32 caracteres hexadecimales. Usa `getRandomValues` y no `randomUUID`, que exige
 * contexto seguro y falla al abrir el juego por http con una IP de red local.
 */
export function createSessionId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Respaldo cuando no hay almacenamiento: el id se mantiene mientras viva la página. */
let memorySessionId: string | null = null;

/** Lee el `sessionId` guardado; si no hay uno válido, crea y guarda uno nuevo. */
export function loadSessionId(storage: KeyValueStorage | null): string {
  const stored = read(storage, KEYS.sessionId);
  if (stored !== null && sessionIdSchema.safeParse(stored).success) return stored;
  if (storage === null) {
    memorySessionId ??= createSessionId();
    return memorySessionId;
  }
  // No había uno, o estaba dañado: se crea y guarda uno nuevo.
  const created = createSessionId();
  write(storage, KEYS.sessionId, created);
  return created;
}

export function loadNickname(storage: KeyValueStorage | null): string {
  return read(storage, KEYS.nickname) ?? '';
}

export function saveNickname(storage: KeyValueStorage | null, name: string): void {
  write(storage, KEYS.nickname, name);
}

export function loadSavedRoom(storage: KeyValueStorage | null): SavedRoom | null {
  const raw = read(storage, KEYS.room);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null) {
      const { code, name } = value as Record<string, unknown>;
      if (typeof code === 'string' && typeof name === 'string') return { code, name };
    }
  } catch {
    // JSON dañado: se trata como si no hubiera sala guardada.
  }
  return null;
}

export function saveRoom(storage: KeyValueStorage | null, room: SavedRoom): void {
  write(storage, KEYS.room, JSON.stringify(room));
}

export function clearSavedRoom(storage: KeyValueStorage | null): void {
  remove(storage, KEYS.room);
}

/** Versión del cliente por la que ya se recargó la página sola: evita recargar en bucle por la misma. */
export function loadReloadedVersion(storage: KeyValueStorage | null): string | null {
  return read(storage, KEYS.reloadedFor);
}

export function saveReloadedVersion(storage: KeyValueStorage | null, version: string): void {
  write(storage, KEYS.reloadedFor, version);
}

/** Error de la pantalla de inicio que debe sobrevivir a una recarga por actualización. */
export function savePendingHomeError(storage: KeyValueStorage | null, error: ErrorCode): void {
  write(storage, KEYS.pendingHomeError, error);
}

/** Lee y borra el error pendiente; ignora cualquier valor que no sea un código conocido. */
export function takePendingHomeError(storage: KeyValueStorage | null): ErrorCode | null {
  const raw = read(storage, KEYS.pendingHomeError);
  if (raw === null) return null;
  remove(storage, KEYS.pendingHomeError);
  return (ERROR_CODES as readonly string[]).includes(raw) ? (raw as ErrorCode) : null;
}
