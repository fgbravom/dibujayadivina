// Historial de trazos del turno en curso. Vive en la red, no en el motor (docs/motor-reglas.md sección 9).
// Todo crecimiento tiene tope: trazos por turno, puntos por trazo y puntos por turno.

import { MAX_STROKES_PER_TURN } from '@dya/shared';
import type { Stroke } from '@dya/shared';

export interface StrokeLimits {
  strokesPerTurn: number;
  /** Puntos (pares x,y) que puede acumular un solo trazo. */
  pointsPerStroke: number;
  /** Puntos (pares x,y) en todo el historial del turno. */
  pointsPerTurn: number;
}

export const DEFAULT_STROKE_LIMITS: StrokeLimits = {
  strokesPerTurn: MAX_STROKES_PER_TURN,
  pointsPerStroke: 5_000,
  pointsPerTurn: 30_000,
};

/**
 * `ok`: se guardó y hay que reenviarlo. `ignored`: se descarta sin avisar (id desconocido o repetido,
 * tope de puntos, nada que deshacer). `too_many_strokes`: se llenó el historial del turno.
 */
export type StrokeOutcome = 'ok' | 'ignored' | 'too_many_strokes';

export class StrokeHistory {
  private strokes: Stroke[] = [];
  private byId = new Map<string, Stroke>();
  private open = new Set<string>();
  private pointCount = 0;
  private readonly limits: StrokeLimits;

  constructor(limits: Partial<StrokeLimits> = {}) {
    this.limits = { ...DEFAULT_STROKE_LIMITS, ...limits };
  }

  /** Trazos del turno, con los deshacer ya aplicados. */
  get list(): readonly Stroke[] {
    return this.strokes;
  }

  start(stroke: Stroke): StrokeOutcome {
    if (this.byId.has(stroke.id)) return 'ignored';
    if (this.strokes.length >= this.limits.strokesPerTurn) return 'too_many_strokes';
    const added = stroke.points.length / 2;
    if (added > this.limits.pointsPerStroke) return 'ignored';
    if (this.pointCount + added > this.limits.pointsPerTurn) return 'ignored';
    const copy: Stroke = { ...stroke, points: [...stroke.points] };
    this.strokes.push(copy);
    this.byId.set(copy.id, copy);
    this.open.add(copy.id);
    this.pointCount += added;
    return 'ok';
  }

  addPoints(id: string, points: number[]): StrokeOutcome {
    const stroke = this.open.has(id) ? this.byId.get(id) : undefined;
    if (!stroke) return 'ignored';
    const added = points.length / 2;
    if (stroke.points.length / 2 + added > this.limits.pointsPerStroke) return 'ignored';
    if (this.pointCount + added > this.limits.pointsPerTurn) return 'ignored';
    for (const value of points) stroke.points.push(value);
    this.pointCount += added;
    return 'ok';
  }

  end(id: string): StrokeOutcome {
    return this.open.delete(id) ? 'ok' : 'ignored';
  }

  undo(): StrokeOutcome {
    const stroke = this.strokes.pop();
    if (!stroke) return 'ignored';
    this.byId.delete(stroke.id);
    this.open.delete(stroke.id);
    this.pointCount -= stroke.points.length / 2;
    return 'ok';
  }

  clear(): void {
    this.reset();
  }

  reset(): void {
    this.strokes = [];
    this.byId.clear();
    this.open.clear();
    this.pointCount = 0;
  }
}
