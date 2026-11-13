import { describe, expect, it, vi } from 'vitest';
import { createMuteStore, MUTE_KEY } from './mute';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('createMuteStore', () => {
  it('por defecto el sonido está activado', () => {
    expect(createMuteStore(fakeStorage()).isMuted()).toBe(false);
    expect(createMuteStore(null).isMuted()).toBe(false);
  });

  it('recuerda la preferencia guardada', () => {
    expect(createMuteStore(fakeStorage({ [MUTE_KEY]: '1' })).isMuted()).toBe(true);
    expect(createMuteStore(fakeStorage({ [MUTE_KEY]: '0' })).isMuted()).toBe(false);
  });

  it('guarda cada cambio y avisa a quien escucha', () => {
    const storage = fakeStorage();
    const store = createMuteStore(storage);
    const listener = vi.fn();
    const off = store.subscribe(listener);

    store.setMuted(true);
    expect(store.isMuted()).toBe(true);
    expect(storage.data.get(MUTE_KEY)).toBe('1');
    expect(listener).toHaveBeenCalledTimes(1);

    store.setMuted(true); // sin cambio: no avisa
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    store.setMuted(false);
    expect(storage.data.get(MUTE_KEY)).toBe('0');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('con el almacenamiento bloqueado sigue funcionando en memoria', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    const store = createMuteStore(broken);
    expect(store.isMuted()).toBe(false);
    store.setMuted(true);
    expect(store.isMuted()).toBe(true);
  });
});
