import {
  CANVAS_BACKGROUND,
  type Stroke,
  type StrokeEndPayload,
  type StrokePointsPayload,
  type StrokeStartPayload,
} from '@dya/shared';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { clientToLogical, fitSize } from './geometry';
import { StrokeEmitter } from './pointBatcher';
import { paintAll, paintStrokeBody, paintStrokeTail, prepareContext } from './render';
import { createStrokeId } from './strokeId';
import { StrokeModel } from './strokeModel';
import type { DrawingCanvasMode, DrawingTool } from './types';

/** Métodos imperativos del lienzo. Los `apply*` son para trazos que llegan de fuera (red). */
export type DrawingCanvasHandle = {
  applyStrokeStart: (payload: StrokeStartPayload) => void;
  applyStrokePoints: (payload: StrokePointsPayload) => void;
  applyStrokeEnd: (payload: StrokeEndPayload) => void;
  /** Quita el último trazo. No emite callbacks: quien lo llama avisa a la red. */
  undo: () => void;
  /** Borra todo. No emite callbacks: quien lo llama avisa a la red. */
  clear: () => void;
  /** Reemplaza el contenido por un historial completo. */
  load: (strokes: Stroke[]) => void;
  /** Copia del historial actual de trazos. */
  getStrokes: () => Stroke[];
};

export type DrawingCanvasProps = {
  mode: DrawingCanvasMode;
  /** Herramienta del dibujante; en modo espectador se ignora. */
  tool: DrawingTool;
  onStrokeStart?: (payload: StrokeStartPayload) => void;
  onStrokePoints?: (payload: StrokePointsPayload) => void;
  onStrokeEnd?: (payload: StrokeEndPayload) => void;
  className?: string;
  ariaLabel?: string;
  ref?: Ref<DrawingCanvasHandle>;
};

type View = { width: number; height: number; dpr: number };

type ActiveStroke = {
  pointerId: number;
  id: string;
  emitter: StrokeEmitter;
  last: [number, number];
};

/** Mantiene en un ref el último valor recibido, para leerlo desde manejadores sin re-suscribirlos. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Lienzo 800 x 600 lógico, escalado al contenedor en 4:3. Si el contenedor tiene alto definido, el
 * lienzo se centra con letterbox; si no, ocupa el ancho completo. No conoce sockets.
 */
export function DrawingCanvas({
  mode,
  tool,
  onStrokeStart,
  onStrokePoints,
  onStrokeEnd,
  className = '',
  ariaLabel = 'Lienzo de dibujo',
  ref,
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model] = useState(() => new StrokeModel());
  const [view, setView] = useState<View>({ width: 0, height: 0, dpr: 1 });
  const activeRef = useRef<ActiveStroke | null>(null);

  const toolRef = useLatest(tool);
  const callbacksRef = useLatest({ onStrokeStart, onStrokePoints, onStrokeEnd });

  /** Ejecuta `paint` con el contexto listo (transformación lógica); no hace nada si aún no hay tamaño. */
  const withContext = useCallback((paint: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return;
    prepareContext(ctx, canvas.width, canvas.height);
    paint(ctx);
  }, []);

  const repaint = useCallback(() => {
    withContext((ctx) => paintAll(ctx, model.strokes, (id) => model.isOpen(id)));
  }, [model, withContext]);

  // Mide el contenedor y calcula el tamaño 4:3 y la densidad de píxeles.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const { width, height } = fitSize(container.clientWidth, container.clientHeight);
      const dpr = window.devicePixelRatio || 1;
      setView((prev) =>
        prev.width === width && prev.height === height && prev.dpr === dpr
          ? prev
          : { width, height, dpr },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Al cambiar tamaño o densidad, el bitmap se reasigna (se borra) y se redibuja todo.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view.width === 0) return;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    repaint();
  }, [view, repaint]);

  /** Cierra el trazo local en curso: vacía lo pendiente y emite `onStrokeEnd`. */
  const finishStroke = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    active.emitter.stop();
    const closed = model.end(active.id);
    if (closed) withContext((ctx) => paintStrokeTail(ctx, closed));
    callbacksRef.current.onStrokeEnd?.({ id: active.id });
  }, [model, callbacksRef, withContext]);

  // Si deja de ser dibujante a mitad de un trazo (p. ej. se acabó el turno), se cierra.
  useEffect(() => {
    if (mode !== 'drawer') finishStroke();
  }, [mode, finishStroke]);
  useEffect(() => finishStroke, [finishStroke]);

  useImperativeHandle(
    ref,
    () => ({
      applyStrokeStart: (payload) => {
        const stroke = model.start(payload);
        if (stroke) withContext((ctx) => paintStrokeBody(ctx, stroke));
      },
      applyStrokePoints: (payload) => {
        const result = model.appendPoints(payload.id, payload.points);
        if (result?.reopened) {
          // El trazo se pintó cerrado (con su tramo final recto): se repinta todo con el trazo abierto.
          repaint();
        } else if (result) {
          withContext((ctx) => paintStrokeBody(ctx, result.stroke, result.previousCount));
        }
      },
      applyStrokeEnd: (payload) => {
        const closed = model.end(payload.id);
        if (closed) withContext((ctx) => paintStrokeTail(ctx, closed));
      },
      undo: () => {
        finishStroke();
        if (model.undo()) repaint();
      },
      clear: () => {
        finishStroke();
        model.clear();
        repaint();
      },
      load: (strokes) => {
        finishStroke();
        model.load(strokes);
        repaint();
      },
      getStrokes: () => model.strokes.map((s) => ({ ...s, points: [...s.points] })),
    }),
    [model, withContext, repaint, finishStroke],
  );

  const toLogical = (e: ReactPointerEvent<HTMLCanvasElement> | PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return clientToLogical(e.clientX, e.clientY, canvas.getBoundingClientRect());
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'drawer') return;
    // Ignora toques secundarios (segundo dedo, palma) y botones que no sean el principal.
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (activeRef.current) return;
    const point = toLogical(e);
    if (!point) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const current = toolRef.current;
    const isEraser = current.tool === 'eraser';
    const payload: StrokeStartPayload = {
      id: createStrokeId(),
      color: isEraser ? CANVAS_BACKGROUND : current.color,
      size: current.size,
      tool: current.tool,
      points: [point[0], point[1]],
    };
    const stroke = model.start(payload);
    if (!stroke) return;
    withContext((ctx) => paintStrokeBody(ctx, stroke));

    const emitter = new StrokeEmitter({
      onPoints: (points) => callbacksRef.current.onStrokePoints?.({ id: payload.id, points }),
    });
    activeRef.current = { pointerId: e.pointerId, id: payload.id, emitter, last: point };
    callbacksRef.current.onStrokeStart?.(payload);
    emitter.start();
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || e.pointerId !== active.pointerId) return;
    const native = e.nativeEvent;
    const events =
      typeof native.getCoalescedEvents === 'function' && native.getCoalescedEvents().length > 0
        ? native.getCoalescedEvents()
        : [native];

    let paintFrom = -1;
    let target: Stroke | null = null;
    for (const event of events) {
      const point = toLogical(event);
      if (!point || (point[0] === active.last[0] && point[1] === active.last[1])) continue;
      const result = model.appendPoints(active.id, point);
      if (!result) continue;
      if (paintFrom < 0) paintFrom = result.previousCount;
      target = result.stroke;
      active.last = point;
      active.emitter.push(point[0], point[1]);
    }
    if (target && paintFrom >= 0) {
      const stroke = target;
      const from = paintFrom;
      withContext((ctx) => paintStrokeBody(ctx, stroke, from));
    }
  };

  const handlePointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || e.pointerId !== active.pointerId) return;
    finishStroke();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const isDrawer = mode === 'drawer';

  return (
    <div
      ref={containerRef}
      className={`relative flex w-full items-center justify-center ${className}`}
      style={{ aspectRatio: '4 / 3', maxHeight: '100%' }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className={`block max-w-full bg-white shadow-sm ring-1 ring-slate-300 select-none ${
          isDrawer ? 'cursor-crosshair' : ''
        }`}
        style={{
          width: view.width,
          height: view.height,
          touchAction: 'none',
          WebkitTouchCallout: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onContextMenu={isDrawer ? (e) => e.preventDefault() : undefined}
      />
    </div>
  );
}
