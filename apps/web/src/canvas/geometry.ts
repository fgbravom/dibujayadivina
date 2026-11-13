// Geometría del lienzo: coordenadas lógicas enteras (800 x 600) y escalado a pantalla. Sin DOM ni React.

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@dya/shared';

/** Redondea y recorta un valor al rango [0, max]. Lo no finito (NaN, Infinity) cae a 0. */
export function clampCoord(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

export function clampPoint(x: number, y: number): [number, number] {
  return [clampCoord(x, CANVAS_WIDTH), clampCoord(y, CANVAS_HEIGHT)];
}

/** Aplica `clampPoint` a un arreglo [x0, y0, x1, y1, ...]; descarta un valor suelto al final. */
export function sanitizePoints(points: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const [x, y] = clampPoint(points[i] ?? 0, points[i + 1] ?? 0);
    out.push(x, y);
  }
  return out;
}

export type ClientRect = { left: number; top: number; width: number; height: number };

/** Convierte una posición de pantalla (clientX/clientY) en coordenadas lógicas enteras dentro del lienzo. */
export function clientToLogical(
  clientX: number,
  clientY: number,
  rect: ClientRect,
): [number, number] {
  if (rect.width <= 0 || rect.height <= 0) return [0, 0];
  const x = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH;
  const y = ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
  return clampPoint(x, y);
}

/**
 * Mayor tamaño 4:3 (en píxeles CSS enteros) que cabe en el espacio disponible.
 * El ancho es múltiplo de 4 para que el alto sea exacto.
 */
export function fitSize(
  availableWidth: number,
  availableHeight: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(availableHeight) ||
    availableWidth <= 0 ||
    availableHeight <= 0
  ) {
    return { width: 0, height: 0 };
  }
  const maxWidth = Math.min(availableWidth, (availableHeight * CANVAS_WIDTH) / CANVAS_HEIGHT);
  const width = Math.floor(maxWidth / 4) * 4;
  return { width, height: (width * CANVAS_HEIGHT) / CANVAS_WIDTH };
}
