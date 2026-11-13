import type { Stroke } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { paintStroke, paintStrokeBody, paintStrokeTail } from './render';

/** Contexto falso que solo anota las operaciones de trayecto (sin DOM). */
function recorder() {
  const ops: string[] = [];
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    beginPath: () => {},
    stroke: () => {},
    fill: () => ops.push('fill'),
    arc: (x: number, y: number) => ops.push(`arc ${x},${y}`),
    moveTo: (x: number, y: number) => ops.push(`move ${x},${y}`),
    lineTo: (x: number, y: number) => ops.push(`line ${x},${y}`),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      ops.push(`curve ${cx},${cy} ${x},${y}`),
  };
  return { ops, ctx: ctx as unknown as CanvasRenderingContext2D };
}

const stroke = (points: number[]): Stroke => ({
  id: 'a',
  color: '#000000',
  size: 8,
  tool: 'brush',
  points,
});

const curvesOf = (ops: string[]) =>
  ops.filter((o) => o.startsWith('curve') || o.startsWith('line'));

describe('pintado de trazos', () => {
  it('un solo punto se dibuja como círculo y no tiene tramo final', () => {
    const { ops, ctx } = recorder();
    const s = stroke([10, 20]);
    paintStroke(ctx, s);
    expect(ops).toEqual(['arc 10,20', 'fill']);
  });

  it('dos puntos: nada en el cuerpo, una recta en el tramo final', () => {
    const { ops, ctx } = recorder();
    const s = stroke([0, 0, 10, 10]);
    paintStrokeBody(ctx, s);
    expect(ops).toEqual([]);
    paintStrokeTail(ctx, s);
    expect(ops).toEqual(['move 0,0', 'line 10,10']);
  });

  it('suaviza por puntos medios: curva con control en cada punto interior', () => {
    const { ops, ctx } = recorder();
    paintStroke(ctx, stroke([0, 0, 10, 0, 10, 10]));
    expect(ops).toEqual(['move 0,0', 'curve 10,0 10,5', 'move 10,5', 'line 10,10']);
  });

  it('pintar por partes (como llegan los puntos) equivale a pintar el trazo entero', () => {
    const points: number[] = [];
    for (let i = 0; i < 40; i += 1) points.push(i * 7, 100 + Math.round(Math.sin(i) * 40));
    const full = recorder();
    paintStroke(full.ctx, stroke(points));

    const partial = recorder();
    const growing = stroke([]);
    let painted = 0;
    // Llegan en tandas de tamaño irregular (1, 2, 3, 1, 2, 3, ...).
    for (let pairs = 0, step = 1; pairs < 40; step = (step % 3) + 1) {
      const take = Math.min(step, 40 - pairs);
      growing.points.push(...points.slice(pairs * 2, (pairs + take) * 2));
      pairs += take;
      paintStrokeBody(partial.ctx, growing, painted);
      painted = pairs;
    }
    paintStrokeTail(partial.ctx, growing);

    expect(curvesOf(partial.ops)).toEqual(curvesOf(full.ops));
  });
});
