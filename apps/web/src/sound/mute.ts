// Preferencia de silencio: se guarda en `localStorage` (con try/catch: en modo privado o con el
// almacenamiento bloqueado puede lanzar) y por defecto el sonido está activado.

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const MUTE_KEY = 'dya.sound.muted';

export type MuteStore = {
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createMuteStore(storage: KeyValueStorage | null): MuteStore {
  let muted = false;
  try {
    muted = storage?.getItem(MUTE_KEY) === '1';
  } catch {
    // Sin almacenamiento: queda el valor por defecto (sonido activado).
  }
  const listeners = new Set<() => void>();

  return {
    isMuted: () => muted,
    setMuted(next) {
      if (next === muted) return;
      muted = next;
      try {
        storage?.setItem(MUTE_KEY, next ? '1' : '0');
      } catch {
        // Sin almacenamiento: la preferencia vale solo mientras la página siga abierta.
      }
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function localStorageOrNull(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Preferencia de este navegador. */
export const muteStore = createMuteStore(localStorageOrNull());
