import { sessionIdSchema } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import {
  clearSavedRoom,
  createSessionId,
  loadNickname,
  loadSavedRoom,
  loadSessionId,
  saveNickname,
  saveRoom,
  type KeyValueStorage,
} from './identity';
import { parseRoomPath } from './route';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** Almacenamiento que lanza en cada acceso, como en un navegador con el almacenamiento bloqueado. */
const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
  removeItem: () => {
    throw new Error('bloqueado');
  },
};

describe('createSessionId', () => {
  it('genera ids válidos para el contrato y distintos entre sí', () => {
    const a = createSessionId();
    const b = createSessionId();
    expect(sessionIdSchema.safeParse(a).success).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('loadSessionId', () => {
  it('crea y guarda un id la primera vez, y lo reutiliza después', () => {
    const storage = memoryStorage();
    const first = loadSessionId(storage);
    expect(loadSessionId(storage)).toBe(first);
    expect(storage.getItem('dya.sessionId')).toBe(first);
  });

  it('reemplaza un valor guardado que no sirve', () => {
    const storage = memoryStorage({ 'dya.sessionId': 'no válido!' });
    const id = loadSessionId(storage);
    expect(sessionIdSchema.safeParse(id).success).toBe(true);
  });

  it('sin almacenamiento sigue funcionando y mantiene el mismo id', () => {
    expect(loadSessionId(null)).toBe(loadSessionId(null));
    expect(sessionIdSchema.safeParse(loadSessionId(brokenStorage)).success).toBe(true);
  });
});

describe('apodo y sala guardada', () => {
  it('guarda y lee el apodo', () => {
    const storage = memoryStorage();
    expect(loadNickname(storage)).toBe('');
    saveNickname(storage, 'Fran');
    expect(loadNickname(storage)).toBe('Fran');
  });

  it('guarda, lee y olvida la sala', () => {
    const storage = memoryStorage();
    expect(loadSavedRoom(storage)).toBeNull();
    saveRoom(storage, { code: 'ABCD', name: 'Fran' });
    expect(loadSavedRoom(storage)).toEqual({ code: 'ABCD', name: 'Fran' });
    clearSavedRoom(storage);
    expect(loadSavedRoom(storage)).toBeNull();
  });

  it('ignora una sala guardada dañada', () => {
    expect(loadSavedRoom(memoryStorage({ 'dya.room': '{no es json' }))).toBeNull();
    expect(loadSavedRoom(memoryStorage({ 'dya.room': '{"code":4}' }))).toBeNull();
    expect(loadSavedRoom(memoryStorage({ 'dya.room': 'null' }))).toBeNull();
  });

  it('con el almacenamiento bloqueado no lanza', () => {
    expect(() => {
      saveNickname(brokenStorage, 'x');
      saveRoom(brokenStorage, { code: 'ABCD', name: 'x' });
      clearSavedRoom(brokenStorage);
    }).not.toThrow();
    expect(loadNickname(brokenStorage)).toBe('');
    expect(loadSavedRoom(brokenStorage)).toBeNull();
    expect(loadNickname(null)).toBe('');
  });
});

describe('parseRoomPath', () => {
  it('reconoce /sala/CODIGO en cualquier mayúscula y con barra final', () => {
    expect(parseRoomPath('/sala/ABCD')).toBe('ABCD');
    expect(parseRoomPath('/sala/abcd')).toBe('ABCD');
    expect(parseRoomPath('/sala/AbCd/')).toBe('ABCD');
  });

  it('descarta todo lo demás', () => {
    expect(parseRoomPath('/')).toBeNull();
    expect(parseRoomPath('/sala/')).toBeNull();
    expect(parseRoomPath('/sala/ABC')).toBeNull();
    expect(parseRoomPath('/sala/ABCDE')).toBeNull();
    expect(parseRoomPath('/sala/AB1D')).toBeNull();
    expect(parseRoomPath('/otra/ABCD')).toBeNull();
    expect(parseRoomPath('/sala/ABCD/extra')).toBeNull();
  });
});
