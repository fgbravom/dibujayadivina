import { describe, expect, it } from 'vitest';
import { MAX_TEXT_MESSAGES_PER_SECOND } from '@dya/shared';
import type { Stroke } from '@dya/shared';
import { TokenBucket } from './rate-limit.js';
import { RoomRegistry } from './rooms.js';
import { StrokeHistory } from './strokes.js';
import { bankWordPicker, fixedWordPicker } from './words.js';
import { createGame } from '../game/index.js';

const stroke = (id: string, points = [1, 1, 2, 2]): Stroke => ({
  id,
  color: '#000000',
  size: 8,
  tool: 'brush',
  points,
});

describe('StrokeHistory', () => {
  it('guarda, acumula puntos, cierra y deshace', () => {
    const h = new StrokeHistory();
    expect(h.start(stroke('a'))).toBe('ok');
    expect(h.addPoints('a', [3, 3])).toBe('ok');
    expect(h.end('a')).toBe('ok');
    expect(h.addPoints('a', [4, 4])).toBe('ignored');
    expect(h.end('a')).toBe('ignored');
    expect(h.list[0]?.points).toEqual([1, 1, 2, 2, 3, 3]);
    expect(h.undo()).toBe('ok');
    expect(h.list).toHaveLength(0);
    expect(h.undo()).toBe('ignored');
  });

  it('ignora ids desconocidos o repetidos', () => {
    const h = new StrokeHistory();
    expect(h.addPoints('x', [1, 1])).toBe('ignored');
    expect(h.start(stroke('a'))).toBe('ok');
    expect(h.start(stroke('a'))).toBe('ignored');
  });

  it('acota trazos, puntos por trazo y puntos por turno', () => {
    const h = new StrokeHistory({ strokesPerTurn: 2, pointsPerStroke: 3, pointsPerTurn: 4 });
    expect(h.start(stroke('a'))).toBe('ok'); // 2 puntos
    expect(h.addPoints('a', [3, 3, 4, 4])).toBe('ignored'); // 4 en el trazo > 3
    expect(h.addPoints('a', [3, 3])).toBe('ok'); // 3 en el trazo, 3 en el turno
    expect(h.start(stroke('b'))).toBe('ignored'); // 5 en el turno > 4
    expect(h.start(stroke('c', [1, 1]))).toBe('ok'); // 4 en el turno
    expect(h.start(stroke('d', [1, 1]))).toBe('too_many_strokes');
    h.reset();
    expect(h.list).toHaveLength(0);
    expect(h.start(stroke('a'))).toBe('ok');
  });
});

describe('TokenBucket', () => {
  it('deja pasar la ráfaga, corta el exceso y repone con el tiempo', () => {
    const bucket = new TokenBucket(MAX_TEXT_MESSAGES_PER_SECOND, 0);
    const allowed = Array.from({ length: 5 }, () => bucket.take(0)).filter(Boolean);
    expect(allowed).toHaveLength(MAX_TEXT_MESSAGES_PER_SECOND);
    expect(bucket.take(100)).toBe(false);
    expect(bucket.take(1000)).toBe(true);
  });
});

describe('RoomRegistry', () => {
  it('genera códigos únicos, respeta el tope y libera al borrar', () => {
    const registry = new RoomRegistry(3, Math.random, {});
    const rooms = [1, 2, 3].map(() => registry.create(createGame()));
    const codes = rooms.map((r) => r?.code ?? '');
    for (const code of codes) expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    expect(new Set(codes).size).toBe(3);
    expect(registry.create(createGame())).toBeNull();
    const first = rooms[0];
    if (first) registry.delete(first);
    expect(registry.size).toBe(2);
    expect(registry.create(createGame())).not.toBeNull();
  });

  it('no repite un código ya ocupado aunque el azar lo proponga', () => {
    const registry = new RoomRegistry(10, () => 0, {});
    expect(registry.create(createGame())?.code).toBe('AAAA');
    // Con un azar constante solo existe un código posible: agotar los intentos debe fallar, no repetir.
    expect(() => registry.create(createGame())).toThrow();
  });
});

describe('selectores de palabras', () => {
  it('el fijo entrega en orden y vuelve a empezar al agotarse', () => {
    const pick = fixedWordPicker(['a', 'b', 'c', 'd', 'e', 'f']);
    const first = pick([], 3).map((w) => w.text);
    expect(first).toEqual(['a', 'b', 'c']);
    expect(pick(first, 3).map((w) => w.text)).toEqual(['d', 'e', 'f']);
    expect(pick([...first, 'd', 'e', 'f'], 3).map((w) => w.text)).toEqual(['a', 'b', 'c']);
  });

  it('el del banco entrega n palabras distintas', () => {
    const picks = bankWordPicker(Math.random)([], 3);
    expect(new Set(picks.map((p) => p.text)).size).toBe(3);
  });
});
