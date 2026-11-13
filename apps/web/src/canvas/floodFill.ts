// Relleno por inundación (bote de pintura) sobre píxeles RGBA. Función pura: sin DOM ni React.

export type Rgb = readonly [number, number, number];

/**
 * Tolerancia por defecto: suma de las diferencias absolutas por canal (R+G+B, de 0 a 765) respecto
 * del color del punto tocado. Absorbe el borde suavizado (antialias) de los trazos para que no quede
 * un halo sin pintar, y es menor que la distancia entre dos colores cualesquiera de la paleta (la
 * menor es 75, verde y celeste): un trazo de otro color nunca queda "dentro" de la zona.
 */
export const FILL_TOLERANCE = 48;

/** Convierte "#rrggbb" en [r, g, b]; null si no tiene ese formato. */
export function parseHexColor(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return null;
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}

/**
 * Rellena con `color` la zona conexta (4 vecinos) que parte en el píxel (x, y). Un píxel pertenece a la
 * zona si su distancia (ver `FILL_TOLERANCE`) al color del píxel inicial es `<= tolerance`; se compara
 * siempre contra el color inicial, no contra el vecino, para no cruzar degradados de un borde.
 *
 * Escribe en `data` (RGBA, `width * height * 4` bytes, alfa 255) y devuelve cuántos píxeles pintó.
 * No hace nada (devuelve 0) si el punto cae fuera o si el color inicial ya es prácticamente el de
 * relleno. Líneas de barrido con pila explícita: sin recursión, memoria lineal.
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Rgb,
  tolerance: number = FILL_TOLERANCE,
): number {
  x = Math.floor(x);
  y = Math.floor(y);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return 0;
  if (!(x >= 0 && x < width && y >= 0 && y < height)) return 0;

  const [fr, fg, fb] = color;
  const start = (y * width + x) * 4;
  const sr = data[start]!;
  const sg = data[start + 1]!;
  const sb = data[start + 2]!;
  if (Math.abs(sr - fr) + Math.abs(sg - fg) + Math.abs(sb - fb) <= tolerance) return 0;

  const matches = (i: number): boolean =>
    Math.abs(data[i]! - sr) + Math.abs(data[i + 1]! - sg) + Math.abs(data[i + 2]! - sb) <=
    tolerance;

  // `seen` marca lo ya pintado: tras pintar no se puede mirar el color (con tolerancia, el color de
  // relleno podría quedar dentro de la zona).
  const seen = new Uint8Array(width * height);
  let stack = new Int32Array(1024);
  let top = 0;
  const push = (pixel: number): void => {
    if (top === stack.length) {
      const bigger = new Int32Array(stack.length * 2);
      bigger.set(stack);
      stack = bigger;
    }
    stack[top++] = pixel;
  };

  /** Empuja una semilla por cada tramo de píxeles de la fila `row` entre las columnas `from` y `to`. */
  const seedRow = (row: number, from: number, to: number): void => {
    const base = row * width;
    let inRun = false;
    for (let col = from; col <= to; col += 1) {
      const open = seen[base + col] === 0 && matches((base + col) * 4);
      if (open && !inRun) push(base + col);
      inRun = open;
    }
  };

  let painted = 0;
  push(y * width + x);
  while (top > 0) {
    const pixel = stack[--top]!;
    if (seen[pixel] !== 0) continue;
    const row = Math.floor(pixel / width);
    const base = row * width;
    let left = pixel - base;
    let right = left;
    while (left > 0 && seen[base + left - 1] === 0 && matches((base + left - 1) * 4)) left -= 1;
    while (right < width - 1 && seen[base + right + 1] === 0 && matches((base + right + 1) * 4)) {
      right += 1;
    }
    for (let col = left; col <= right; col += 1) {
      seen[base + col] = 1;
      const i = (base + col) * 4;
      data[i] = fr;
      data[i + 1] = fg;
      data[i + 2] = fb;
      data[i + 3] = 255;
    }
    painted += right - left + 1;
    if (row > 0) seedRow(row - 1, left, right);
    if (row < height - 1) seedRow(row + 1, left, right);
  }
  return painted;
}
