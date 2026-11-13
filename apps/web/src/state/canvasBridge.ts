// Puente entre los eventos del servidor y el lienzo. El lienzo solo existe mientras se muestra la
// pantalla de partida, pero los eventos llegan antes (o en el mismo instante) de que se monte: el
// puente guarda lo pendiente y lo aplica en orden cuando el lienzo se conecta.

import type {
  Stroke,
  StrokeEndPayload,
  StrokePointsPayload,
  StrokeStartPayload,
} from '@dya/shared';
import type { DrawingCanvasHandle } from '../canvas';
import type { ServerEvent } from './session';

export type CanvasCommand =
  | { type: 'load'; strokes: Stroke[] }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'strokeStart'; payload: StrokeStartPayload }
  | { type: 'strokePoints'; payload: StrokePointsPayload }
  | { type: 'strokeEnd'; payload: StrokeEndPayload };

/**
 * Qué debe hacer el lienzo ante un evento del servidor (`null` si no le incumbe).
 * - `room:state` carga el historial; en sala de espera y fin de partida no hay dibujo que mostrar.
 * - `turn:choosing` vacía el lienzo: el servidor no manda un evento de limpieza al cambiar de turno.
 */
export function canvasCommandFor(event: ServerEvent): CanvasCommand | null {
  switch (event.type) {
    case 'room:state': {
      const { phase, strokes } = event.payload;
      const hasCanvas = phase !== 'LOBBY' && phase !== 'GAME_END';
      return { type: 'load', strokes: hasCanvas ? strokes : [] };
    }
    case 'turn:choosing':
      return { type: 'clear' };
    case 'stroke:start':
      return { type: 'strokeStart', payload: event.payload };
    case 'stroke:points':
      return { type: 'strokePoints', payload: event.payload };
    case 'stroke:end':
      return { type: 'strokeEnd', payload: event.payload };
    case 'canvas:undo':
      return { type: 'undo' };
    case 'canvas:clear':
      return { type: 'clear' };
    default:
      return null;
  }
}

function apply(handle: DrawingCanvasHandle, command: CanvasCommand): void {
  switch (command.type) {
    case 'load':
      return handle.load(command.strokes);
    case 'clear':
      return handle.clear();
    case 'undo':
      return handle.undo();
    case 'strokeStart':
      return handle.applyStrokeStart(command.payload);
    case 'strokePoints':
      return handle.applyStrokePoints(command.payload);
    case 'strokeEnd':
      return handle.applyStrokeEnd(command.payload);
  }
}

/** Tope de comandos en espera; el lienzo se monta en cuestión de milisegundos, esto es solo un seguro. */
const MAX_PENDING = 5000;

export class CanvasBridge {
  private handle: DrawingCanvasHandle | null = null;
  private pending: CanvasCommand[] = [];

  /** Conecta (o desconecta con `null`) el lienzo. Al conectar se aplica lo que llegó antes. */
  setHandle(handle: DrawingCanvasHandle | null): void {
    this.handle = handle;
    if (!handle) return;
    const queued = this.pending;
    this.pending = [];
    for (const command of queued) apply(handle, command);
  }

  dispatch(command: CanvasCommand): void {
    if (this.handle) {
      apply(this.handle, command);
      return;
    }
    // Cargar o limpiar reemplaza todo lo anterior: no hace falta recordarlo.
    if (command.type === 'load' || command.type === 'clear') this.pending = [];
    if (this.pending.length < MAX_PENDING) this.pending.push(command);
  }
}

/** Instancia única: el cliente de sockets escribe en ella y la pantalla de partida la conecta. */
export const canvasBridge = new CanvasBridge();
