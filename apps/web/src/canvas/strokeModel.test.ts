import { STROKE_ID_MAX_LENGTH, type Stroke } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { createStrokeId } from './strokeId';
import { StrokeModel } from './strokeModel';

const stroke = (id: string, points: number[] = [10, 10]): Stroke => ({
  id,
  color: '#000000',
  size: 8,
  tool: 'brush',
  points,
});

describe('StrokeModel', () => {
  it('start agrega el trazo y appendPoints le suma puntos', () => {
    const model = new StrokeModel();
    model.start(stroke('a', [1, 1]));
    const result = model.appendPoints('a', [2, 2, 3, 3]);
    expect(result?.previousCount).toBe(1);
    expect(model.strokes[0]?.points).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('copia el trazo recibido (no comparte el arreglo de puntos)', () => {
    const model = new StrokeModel();
    const input = stroke('a', [1, 1]);
    model.start(input);
    model.appendPoints('a', [2, 2]);
    expect(input.points).toEqual([1, 1]);
  });

  it('recorta y redondea los puntos que entran', () => {
    const model = new StrokeModel();
    model.start(stroke('a', [-5, 700]));
    model.appendPoints('a', [900.4, 12.6]);
    expect(model.strokes[0]?.points).toEqual([0, 600, 800, 13]);
  });

  it('ignora ids repetidos y puntos de trazos inexistentes o cerrados', () => {
    const model = new StrokeModel();
    expect(model.start(stroke('a'))).not.toBeNull();
    expect(model.start(stroke('a'))).toBeNull();
    expect(model.strokes).toHaveLength(1);
    expect(model.appendPoints('zzz', [1, 1])).toBeNull();
    model.end('a');
    expect(model.appendPoints('a', [1, 1])).toBeNull();
    expect(model.strokes[0]?.points).toEqual([10, 10]);
  });

  it('end devuelve el trazo solo la primera vez e isOpen refleja el estado', () => {
    const model = new StrokeModel();
    model.start(stroke('a'));
    expect(model.isOpen('a')).toBe(true);
    expect(model.end('a')?.id).toBe('a');
    expect(model.isOpen('a')).toBe(false);
    expect(model.end('a')).toBeNull();
    expect(model.end('nope')).toBeNull();
  });

  it('undo quita el último trazo y lo devuelve', () => {
    const model = new StrokeModel();
    model.start(stroke('a'));
    model.start(stroke('b'));
    expect(model.undo()?.id).toBe('b');
    expect(model.strokes.map((s) => s.id)).toEqual(['a']);
    expect(model.undo()?.id).toBe('a');
    expect(model.undo()).toBeNull();
    expect(model.strokes).toEqual([]);
  });

  it('undo de un trazo abierto lo cierra: sus puntos tardíos se ignoran', () => {
    const model = new StrokeModel();
    model.start(stroke('a'));
    model.undo();
    expect(model.appendPoints('a', [5, 5])).toBeNull();
    expect(model.strokes).toEqual([]);
  });

  it('clear vacía todo y cierra los trazos abiertos', () => {
    const model = new StrokeModel();
    model.start(stroke('a'));
    model.end('a');
    model.start(stroke('b'));
    model.clear();
    expect(model.strokes).toEqual([]);
    expect(model.appendPoints('b', [1, 1])).toBeNull();
  });

  it('load reemplaza el historial, sanea y descarta ids repetidos', () => {
    const model = new StrokeModel();
    model.start(stroke('viejo'));
    model.load([stroke('a', [1, 1, 2, 2]), stroke('b', [900, 900]), stroke('a')]);
    expect(model.strokes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(model.strokes[1]?.points).toEqual([800, 600]);
  });

  it('tras load los trazos están cerrados, pero se pueden deshacer', () => {
    const model = new StrokeModel();
    model.load([stroke('a'), stroke('b')]);
    expect(model.appendPoints('b', [1, 1])).toBeNull();
    expect(model.undo()?.id).toBe('b');
    expect(model.strokes.map((s) => s.id)).toEqual(['a']);
  });

  it('una secuencia start/points/end como la de la red reconstruye el trazo', () => {
    const model = new StrokeModel();
    model.start(stroke('a', [0, 0]));
    model.appendPoints('a', [1, 1]);
    model.appendPoints('a', [2, 2]);
    model.end('a');
    model.start(stroke('b', [5, 5]));
    model.end('b');
    expect(model.strokes.map((s) => s.points)).toEqual([
      [0, 0, 1, 1, 2, 2],
      [5, 5],
    ]);
  });
});

describe('createStrokeId', () => {
  it('genera ids cortos, válidos para el contrato y únicos', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const id = createStrokeId();
      expect(id.length).toBeGreaterThan(0);
      expect(id.length).toBeLessThanOrEqual(STROKE_ID_MAX_LENGTH);
      expect(id).toMatch(/^[0-9a-f]+$/);
      ids.add(id);
    }
    expect(ids.size).toBe(2000);
  });
});
