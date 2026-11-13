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
import {
  BUFFER_HEIGHT,
  BUFFER_WIDTH,
  paintAll,
  paintFill,
  paintStrokeBody,
  paintStrokeTail,
  presentBuffer,
  prepareContext,
} from './render';
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

/** Cursor del bote de pintura: el balde del botón, con la punta de vertido como punto activo. */
const BUCKET_CURSOR = (() => {
  const shapes =
    '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/>' +
    '<path d="m5 2 5 5"/><path d="M2 13h15"/>' +
    '<path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" ' +
    'fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    `<g stroke="#fff" stroke-width="4.5">${shapes}</g><g stroke="#0f172a" stroke-width="2">${shapes}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 19, copy`;
})();

/**
 * Lienzo 800 x 600 lógico, escalado al contenedor en 4:3. Si el contenedor tiene alto definido, el
 * lienzo se centra con letterbox; si no, ocupa el ancho completo. No conoce sockets.
 *
 * La imagen vive en un búfer fuera de pantalla de resolución fija (2x el espacio lógico): trazos y
 * rellenos se pintan ahí, en orden, y el canvas visible solo lo copia a su tamaño. Así redimensionar
 * o girar no repinta el historial, y el relleno por píxeles es igual en todas las pantallas.
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
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);

  const toolRef = useLatest(tool);
  const callbacksRef = useLatest({ onStrokeStart, onStrokePoints, onStrokeEnd });

  /** Búfer fuera de pantalla, creado la primera vez que hace falta. */
  const getBuffer = useCallback(() => {
    if (!bufferRef.current) {
      const buffer = document.createElement('canvas');
      buffer.width = BUFFER_WIDTH;
      buffer.height = BUFFER_HEIGHT;
      // willReadFrequently: el relleno lee y reescribe los píxeles; en memoria de CPU es mucho más rápido.
      const ctx = buffer.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        prepareContext(ctx, buffer.width, buffer.height);
        paintAll(ctx, []);
      }
      bufferRef.current = buffer;
    }
    return bufferRef.current;
  }, []);

  /** Copia el búfer al canvas visible (escalado). */
  const present = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    const canvas = canvasRef.current;
    if (canvas) presentBuffer(canvas, getBuffer());
  }, [getBuffer]);

  /** Como `present`, pero junta las llamadas de un mismo cuadro (trazo en curso, muchos eventos). */
  const schedulePresent = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      present();
    });
  }, [present]);

  /**
   * Ejecuta `paint` sobre el búfer (coordenadas lógicas) y lo muestra. Por defecto la copia espera al
   * siguiente cuadro; los cambios puntuales (cerrar trazo, relleno, deshacer, cargar) la hacen ya.
   */
  const withContext = useCallback(
    (paint: (ctx: CanvasRenderingContext2D) => void, immediate = false) => {
      const ctx = getBuffer().getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      paint(ctx);
      if (immediate) present();
      else schedulePresent();
    },
    [getBuffer, present, schedulePresent],
  );

  /** Reconstruye el búfer desde el modelo (deshacer, limpiar, cargar). */
  const repaint = useCallback(() => {
    withContext((ctx) => paintAll(ctx, model.strokes, (id) => model.isOpen(id)), true);
  }, [model, withContext]);

  // Un cuadro pendiente no debe sobrevivir al lienzo.
  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

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

  // Al cambiar tamaño o densidad, el bitmap visible se reasigna (se borra) y se vuelve a copiar el búfer.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view.width === 0) return;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    present();
  }, [view, present]);

  /** Cierra el trazo local en curso: vacía lo pendiente y emite `onStrokeEnd`. */
  const finishStroke = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    active.emitter.stop();
    const closed = model.end(active.id);
    if (closed) withContext((ctx) => paintStrokeTail(ctx, closed), true);
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
        if (!stroke) return;
        if (stroke.tool === 'fill') withContext((ctx) => paintFill(ctx, stroke), true);
        else withContext((ctx) => paintStrokeBody(ctx, stroke));
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
        if (closed) withContext((ctx) => paintStrokeTail(ctx, closed), true);
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

    const current = toolRef.current;

    if (current.tool === 'fill') {
      // Un toque basta: el relleno es un trazo de un punto, que empieza y termina de inmediato.
      const fill: StrokeStartPayload = {
        id: createStrokeId(),
        color: current.color,
        size: current.size,
        tool: 'fill',
        points: [point[0], point[1]],
      };
      const started = model.start(fill);
      if (!started) return;
      model.end(fill.id);
      withContext((ctx) => paintFill(ctx, started), true);
      callbacksRef.current.onStrokeStart?.(fill);
      callbacksRef.current.onStrokeEnd?.({ id: fill.id });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
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
  const isFill = isDrawer && tool.tool === 'fill';

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
        data-tool={isDrawer ? tool.tool : undefined}
        className={`block max-w-full bg-white shadow-sm ring-1 ring-slate-300 select-none ${
          isDrawer && !isFill ? 'cursor-crosshair' : ''
        }`}
        style={{
          width: view.width,
          height: view.height,
          cursor: isFill ? BUCKET_CURSOR : undefined,
          touchAction: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        // Sin menú al mantener presionado (guardar imagen, etc.), también para quien solo mira.
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
