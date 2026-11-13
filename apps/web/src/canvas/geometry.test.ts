import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { clampCoord, clampPoint, clientToLogical, fitSize, sanitizePoints } from './geometry';

describe('clampCoord / clampPoint', () => {
  it('redondea y recorta al rango', () => {
    expect(clampCoord(10.4, CANVAS_WIDTH)).toBe(10);
    expect(clampCoord(10.6, CANVAS_WIDTH)).toBe(11);
    expect(clampCoord(-5, CANVAS_WIDTH)).toBe(0);
    expect(clampCoord(9999, CANVAS_WIDTH)).toBe(CANVAS_WIDTH);
    expect(clampCoord(Number.NaN, CANVAS_WIDTH)).toBe(0);
    expect(clampCoord(Number.POSITIVE_INFINITY, CANVAS_WIDTH)).toBe(0);
  });

  it('usa el ancho para x y el alto para y', () => {
    expect(clampPoint(900, 700)).toEqual([CANVAS_WIDTH, CANVAS_HEIGHT]);
    expect(clampPoint(-1, -1)).toEqual([0, 0]);
  });
});

describe('sanitizePoints', () => {
  it('recorta cada par y descarta un valor suelto al final', () => {
    expect(sanitizePoints([1.2, 2.7, -4, 1000, 5])).toEqual([1, 3, 0, 600]);
  });

  it('devuelve vacío si no hay un par completo', () => {
    expect(sanitizePoints([])).toEqual([]);
    expect(sanitizePoints([3])).toEqual([]);
  });
});

describe('clientToLogical', () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 };

  it('escala el lienzo mostrado al espacio lógico 800 x 600', () => {
    expect(clientToLogical(100, 50, rect)).toEqual([0, 0]);
    expect(clientToLogical(500, 350, rect)).toEqual([800, 600]);
    expect(clientToLogical(300, 200, rect)).toEqual([400, 300]);
  });

  it('recorta lo que cae fuera del lienzo (pointer capture fuera del borde)', () => {
    expect(clientToLogical(0, 0, rect)).toEqual([0, 0]);
    expect(clientToLogical(2000, 2000, rect)).toEqual([800, 600]);
  });

  it('devuelve enteros', () => {
    const [x, y] = clientToLogical(133.3, 77.7, rect);
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
  });

  it('con un rectángulo vacío devuelve el origen', () => {
    expect(clientToLogical(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0]);
  });

  it('funciona con escala no entera (pantalla pequeña)', () => {
    const small = { left: 0, top: 0, width: 332, height: 249 };
    expect(clientToLogical(166, 124.5, small)).toEqual([400, 300]);
  });
});

describe('fitSize', () => {
  it('limitado por el ancho', () => {
    expect(fitSize(800, 1000)).toEqual({ width: 800, height: 600 });
    expect(fitSize(360, 1000)).toEqual({ width: 360, height: 270 });
  });

  it('limitado por el alto', () => {
    expect(fitSize(1000, 300)).toEqual({ width: 400, height: 300 });
  });

  it('mantiene 4:3 exacto con anchos que no son múltiplo de 4', () => {
    const { width, height } = fitSize(343, 5000);
    expect(width).toBe(340);
    expect(height).toBe(255);
    expect(width / height).toBeCloseTo(4 / 3, 10);
  });

  it('devuelve 0 con espacio vacío o inválido', () => {
    expect(fitSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitSize(100, 0)).toEqual({ width: 0, height: 0 });
    expect(fitSize(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
    expect(fitSize(100, Number.POSITIVE_INFINITY)).toEqual({ width: 0, height: 0 });
  });
});
