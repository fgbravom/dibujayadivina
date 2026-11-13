import type { StrokeSize, StrokeTool } from '@dya/shared';

/** Herramienta actual del dibujante. Con `tool: 'eraser'` el color se ignora (la goma pinta con el fondo). */
export type DrawingTool = {
  color: string;
  size: StrokeSize;
  tool: StrokeTool;
};

export type DrawingCanvasMode = 'drawer' | 'spectator';
