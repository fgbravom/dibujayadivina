// Pintado sobre un CanvasRenderingContext2D. El contexto trabaja en coordenadas lógicas (800 x 600):
// `prepareContext` fija la transformación según el tamaño real del bitmap. Todo se pinta en un búfer
// fuera de pantalla de resolución fija (`BUFFER_WIDTH` x `BUFFER_HEIGHT`), igual en todos los
// dispositivos: así el relleno por píxeles da el mismo resultado en cada pantalla. El canvas visible
// solo muestra ese búfer escalado (`presentBuffer`).

import { CANVAS_BACKGROUND, CANVAS_HEIGHT, CANVAS_WIDTH, type Stroke } from '@dya/shared';
import { floodFill, parseHexColor } from './floodFill';

/** El búfer tiene el doble de resolución que el espacio lógico. */
export const BUFFER_SCALE = 2;
export const BUFFER_WIDTH = CANVAS_WIDTH * BUFFER_SCALE;
export const BUFFER_HEIGHT = CANVAS_HEIGHT * BUFFER_SCALE;

export function prepareContext(
  ctx: CanvasRenderingContext2D,
  bitmapWidth: number,
  bitmapHeight: number,
): void {
  ctx.setTransform(bitmapWidth / CANVAS_WIDTH, 0, 0, bitmapHeight / CANVAS_HEIGHT, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function paintBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CANVAS_BACKGROUND;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/**
 * Trazos suavizados con curvas cuadráticas por puntos medios. Mientras un trazo está abierto solo se
 * pintan los tramos "firmes" (hasta el punto medio entre los dos últimos puntos): así no queda tinta
 * provisional que la curva final no cubriría. `paintStrokeTail` agrega el último tramo al cerrar.
 *
 * `fromCount` es la cantidad de puntos (pares) que ya estaban pintados: solo se dibuja lo nuevo.
 * Un solo punto se dibuja como círculo (igual que el casquete redondo del trazo que sigue).
 */
export function paintStrokeBody(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  fromCount = 0,
): void {
  const p = stroke.points;
  const n = p.length >> 1;
  if (stroke.tool === 'fill' || n === 0 || fromCount >= n) return;
  const px = (i: number) => p[2 * i] ?? 0;
  const py = (i: number) => p[2 * i + 1] ?? 0;

  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;

  if (n === 1) {
    ctx.beginPath();
    ctx.arc(px(0), py(0), stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // La curva i va de (i == 1 ? P0 : medio(i-1, i)) a medio(i, i+1) con control Pi.
  const first = Math.max(1, fromCount - 1);
  if (first > n - 2) return;
  ctx.beginPath();
  if (first === 1) {
    ctx.moveTo(px(0), py(0));
  } else {
    ctx.moveTo((px(first - 1) + px(first)) / 2, (py(first - 1) + py(first)) / 2);
  }
  for (let i = first; i <= n - 2; i += 1) {
    ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
  }
  ctx.stroke();
}

/** Último tramo recto de un trazo cerrado (del último punto medio al último punto). */
export function paintStrokeTail(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const p = stroke.points;
  const n = p.length >> 1;
  if (stroke.tool === 'fill' || n < 2) return;
  const px = (i: number) => p[2 * i] ?? 0;
  const py = (i: number) => p[2 * i + 1] ?? 0;

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.beginPath();
  if (n === 2) {
    ctx.moveTo(px(0), py(0));
  } else {
    ctx.moveTo((px(n - 2) + px(n - 1)) / 2, (py(n - 2) + py(n - 1)) / 2);
  }
  ctx.lineTo(px(n - 1), py(n - 1));
  ctx.stroke();
}

/** Pinta un trazo cerrado completo. Un relleno no se pinta aquí: ver `paintFill`. */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  paintStrokeBody(ctx, stroke);
  paintStrokeTail(ctx, stroke);
}

/** Punto (en píxeles del búfer) desde el que parte un relleno. */
function fillOrigin(stroke: Stroke, width: number, height: number): [number, number] {
  const x = Math.round(((stroke.points[0] ?? 0) * width) / CANVAS_WIDTH);
  const y = Math.round(((stroke.points[1] ?? 0) * height) / CANVAS_HEIGHT);
  return [Math.min(width - 1, Math.max(0, x)), Math.min(height - 1, Math.max(0, y))];
}

/** Aplica un relleno sobre el contenido actual del contexto (lee y reescribe sus píxeles). */
export function paintFill(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { width, height } = ctx.canvas;
  const color = parseHexColor(stroke.color);
  if (!color || width === 0 || height === 0) return;
  const image = ctx.getImageData(0, 0, width, height);
  const [x, y] = fillOrigin(stroke, width, height);
  if (floodFill(image.data, width, height, x, y, color) > 0) ctx.putImageData(image, 0, 0);
}

/**
 * Repinta todo; los trazos abiertos (`isOpen`) quedan sin su último tramo, que se agrega al cerrarlos.
 * Rellenos seguidos comparten una sola lectura de píxeles.
 */
export function paintAll(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  isOpen: (id: string) => boolean = () => false,
): void {
  paintBackground(ctx);
  const { width, height } = ctx.canvas;
  let pixels: ImageData | null = null;
  let dirty = false;
  const flush = () => {
    if (pixels && dirty) ctx.putImageData(pixels, 0, 0);
    pixels = null;
    dirty = false;
  };
  for (const stroke of strokes) {
    if (stroke.tool === 'fill') {
      const color = parseHexColor(stroke.color);
      if (!color || width === 0 || height === 0) continue;
      pixels ??= ctx.getImageData(0, 0, width, height);
      const [x, y] = fillOrigin(stroke, width, height);
      if (floodFill(pixels.data, width, height, x, y, color) > 0) dirty = true;
      continue;
    }
    flush();
    if (isOpen(stroke.id)) paintStrokeBody(ctx, stroke);
    else paintStroke(ctx, stroke);
  }
  flush();
}

/** Muestra el búfer en el canvas visible, escalado a su tamaño (con suavizado). */
export function presentBuffer(target: HTMLCanvasElement, buffer: HTMLCanvasElement): void {
  const ctx = target.getContext('2d');
  if (!ctx || target.width === 0 || target.height === 0) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, target.width, target.height);
}
