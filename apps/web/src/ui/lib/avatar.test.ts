import { describe, expect, it } from 'vitest';
import { AVATAR_CLASSES, avatarClass, avatarIndex, avatarInitial } from './avatar';

describe('avatarIndex', () => {
  it('es estable y está dentro del rango', () => {
    for (const seed of ['p1', 'p2', 'Ana', '', 'ñandú']) {
      const index = avatarIndex(seed);
      expect(index).toBe(avatarIndex(seed));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_CLASSES.length);
      expect(AVATAR_CLASSES).toContain(avatarClass(seed));
    }
  });

  it('reparte distintas semillas en varios colores', () => {
    const used = new Set(Array.from({ length: 12 }, (_, i) => avatarIndex(`player-${i}`)));
    expect(used.size).toBeGreaterThan(3);
  });
});

describe('avatarInitial', () => {
  it('toma la primera letra en mayúscula', () => {
    expect(avatarInitial('ana')).toBe('A');
    expect(avatarInitial('  ñandú')).toBe('Ñ');
  });

  it('no parte un emoji por la mitad', () => {
    expect(avatarInitial('🐙 pulpo')).toBe('🐙');
  });

  it('tiene un respaldo para un apodo vacío', () => {
    expect(avatarInitial('   ')).toBe('?');
  });
});
