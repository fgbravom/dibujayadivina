// Distancia de edición con salida temprana.

/**
 * Distancia de Levenshtein entre `a` y `b` (por puntos de código). Si supera `max`, devuelve
 * `max + 1` sin terminar el cálculo.
 */
export function levenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > max) return max + 1;
  if (x.length === 0) return Math.min(y.length, max + 1);
  if (y.length === 0) return Math.min(x.length, max + 1);

  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      const value = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return Math.min(prev[y.length] ?? 0, max + 1);
}
