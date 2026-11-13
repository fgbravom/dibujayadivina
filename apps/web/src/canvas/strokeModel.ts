// Modelo de trazos: la lista de trazos es la fuente de verdad del lienzo. Sin DOM ni React.

import type { Stroke } from '@dya/shared';
import { sanitizePoints } from './geometry';

/** Copia un trazo con los puntos redondeados y recortados al lienzo. */
function cloneStroke(stroke: Stroke): Stroke {
  return {
    id: stroke.id,
    color: stroke.color,
    size: stroke.size,
    tool: stroke.tool,
    points: sanitizePoints(stroke.points),
  };
}

export type AppendResult = {
  stroke: Stroke;
  /** Cantidad de puntos (pares) que tenía el trazo antes de agregar. */
  previousCount: number;
};

export class StrokeModel {
  private list: Stroke[] = [];
  /** Ids de trazos que aún reciben puntos (no han llegado a `end`). */
  private open = new Set<string>();

  get strokes(): readonly Stroke[] {
    return this.list;
  }

  /** Agrega un trazo nuevo y lo deja abierto. Devuelve null si el id ya existe. */
  start(stroke: Stroke): Stroke | null {
    if (this.list.some((s) => s.id === stroke.id)) return null;
    const copy = cloneStroke(stroke);
    this.list.push(copy);
    this.open.add(copy.id);
    return copy;
  }

  /** Agrega puntos a un trazo abierto. Devuelve null si no existe o ya se cerró. */
  appendPoints(id: string, points: readonly number[]): AppendResult | null {
    if (!this.open.has(id)) return null;
    const stroke = this.find(id);
    if (!stroke) return null;
    const previousCount = stroke.points.length / 2;
    stroke.points.push(...sanitizePoints(points));
    return { stroke, previousCount };
  }

  /** Cierra un trazo abierto y lo devuelve; null si no existe o ya estaba cerrado. */
  end(id: string): Stroke | null {
    if (!this.open.delete(id)) return null;
    return this.find(id) ?? null;
  }

  isOpen(id: string): boolean {
    return this.open.has(id);
  }

  /** Quita el último trazo y lo devuelve; null si no hay ninguno. */
  undo(): Stroke | null {
    const removed = this.list.pop() ?? null;
    if (removed) this.open.delete(removed.id);
    return removed;
  }

  clear(): void {
    this.list = [];
    this.open.clear();
  }

  /** Reemplaza todo por un historial ya completo (trazos cerrados). */
  load(strokes: readonly Stroke[]): void {
    this.list = [];
    this.open.clear();
    for (const stroke of strokes) {
      if (this.list.some((s) => s.id === stroke.id)) continue;
      this.list.push(cloneStroke(stroke));
    }
  }

  private find(id: string): Stroke | undefined {
    // Los trazos abiertos casi siempre están al final.
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const stroke = this.list[i];
      if (stroke && stroke.id === id) return stroke;
    }
    return undefined;
  }
}
