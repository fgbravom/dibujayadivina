// Agrupado de puntos del dibujante: se acumulan y se emiten cada STROKE_FLUSH_INTERVAL_MS,
// partidos en mensajes de hasta MAX_POINTS_PER_MESSAGE pares. Sin DOM ni React.

import { MAX_POINTS_PER_MESSAGE, STROKE_FLUSH_INTERVAL_MS } from '@dya/shared';

/** Parte [x0, y0, x1, y1, ...] en trozos de hasta `maxPairs` pares (x, y). Un valor suelto al final se descarta. */
export function chunkPoints(
  points: readonly number[],
  maxPairs: number = MAX_POINTS_PER_MESSAGE,
): number[][] {
  const pairsPerChunk = Math.max(1, Math.floor(maxPairs));
  const usable = points.length - (points.length % 2);
  const chunks: number[][] = [];
  for (let i = 0; i < usable; i += pairsPerChunk * 2) {
    chunks.push(points.slice(i, Math.min(usable, i + pairsPerChunk * 2)));
  }
  return chunks;
}

export type StrokeEmitterOptions = {
  /** Recibe cada mensaje de puntos ya partido. */
  onPoints: (points: number[]) => void;
  intervalMs?: number;
  maxPairs?: number;
};

/** Acumula puntos de un trazo y los entrega por tandas periódicas; `stop()` vacía lo pendiente. */
export class StrokeEmitter {
  private pending: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onPoints: (points: number[]) => void;
  private readonly intervalMs: number;
  private readonly maxPairs: number;

  constructor(options: StrokeEmitterOptions) {
    this.onPoints = options.onPoints;
    this.intervalMs = options.intervalMs ?? STROKE_FLUSH_INTERVAL_MS;
    this.maxPairs = options.maxPairs ?? MAX_POINTS_PER_MESSAGE;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.flush(), this.intervalMs);
  }

  push(x: number, y: number): void {
    this.pending.push(x, y);
  }

  /** Emite ahora lo pendiente (puede ser más de un mensaje). */
  flush(): void {
    if (this.pending.length === 0) return;
    const chunks = chunkPoints(this.pending, this.maxPairs);
    this.pending = [];
    for (const chunk of chunks) this.onPoints(chunk);
  }

  /** Detiene el temporizador y vacía lo pendiente antes de volver. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}
