import { MAX_POINTS_PER_MESSAGE, STROKE_FLUSH_INTERVAL_MS } from '@dya/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chunkPoints, StrokeEmitter } from './pointBatcher';

describe('chunkPoints', () => {
  it('no parte lo que cabe en un mensaje', () => {
    expect(chunkPoints([1, 2, 3, 4], 64)).toEqual([[1, 2, 3, 4]]);
  });

  it('parte en trozos de hasta maxPairs pares, sin romper pares', () => {
    const points = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
    expect(chunkPoints(points, 2)).toEqual([
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [4, 4],
    ]);
  });

  it('con el máximo del contrato, 150 pares dan 64 + 64 + 22', () => {
    const points = Array.from({ length: 300 }, (_, i) => i);
    const sizes = chunkPoints(points).map((c) => c.length / 2);
    expect(sizes).toEqual([MAX_POINTS_PER_MESSAGE, MAX_POINTS_PER_MESSAGE, 22]);
    expect(chunkPoints(points).flat()).toEqual(points);
  });

  it('descarta un valor suelto y devuelve vacío sin datos', () => {
    expect(chunkPoints([1, 2, 3])).toEqual([[1, 2]]);
    expect(chunkPoints([])).toEqual([]);
    expect(chunkPoints([7])).toEqual([]);
  });

  it('trata un maxPairs inválido como 1', () => {
    expect(chunkPoints([1, 2, 3, 4], 0)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('StrokeEmitter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emite lo acumulado cada STROKE_FLUSH_INTERVAL_MS y no emite si no hay nada', () => {
    const sent: number[][] = [];
    const emitter = new StrokeEmitter({ onPoints: (p) => sent.push(p) });
    emitter.start();

    vi.advanceTimersByTime(STROKE_FLUSH_INTERVAL_MS * 3);
    expect(sent).toEqual([]);

    emitter.push(1, 2);
    emitter.push(3, 4);
    vi.advanceTimersByTime(STROKE_FLUSH_INTERVAL_MS - 1);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([[1, 2, 3, 4]]);

    emitter.push(5, 6);
    vi.advanceTimersByTime(STROKE_FLUSH_INTERVAL_MS);
    expect(sent).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
    emitter.stop();
  });

  it('parte una tanda grande en mensajes de hasta MAX_POINTS_PER_MESSAGE pares', () => {
    const sent: number[][] = [];
    const emitter = new StrokeEmitter({ onPoints: (p) => sent.push(p) });
    emitter.start();
    for (let i = 0; i < 150; i += 1) emitter.push(i, i);
    vi.advanceTimersByTime(STROKE_FLUSH_INTERVAL_MS);
    expect(sent.map((p) => p.length / 2)).toEqual([64, 64, 22]);
    emitter.stop();
  });

  it('stop vacía lo pendiente y detiene el temporizador', () => {
    const sent: number[][] = [];
    const emitter = new StrokeEmitter({ onPoints: (p) => sent.push(p) });
    emitter.start();
    emitter.push(1, 1);
    emitter.stop();
    expect(sent).toEqual([[1, 1]]);

    emitter.push(2, 2);
    vi.advanceTimersByTime(STROKE_FLUSH_INTERVAL_MS * 5);
    expect(sent).toEqual([[1, 1]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('start es idempotente (un solo temporizador)', () => {
    const emitter = new StrokeEmitter({ onPoints: () => {} });
    emitter.start();
    emitter.start();
    expect(vi.getTimerCount()).toBe(1);
    emitter.stop();
  });
});
