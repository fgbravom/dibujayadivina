import type { Stroke } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import type { DrawingCanvasHandle } from '../canvas';
import { CanvasBridge } from './canvasBridge';

const stroke: Stroke = { id: 's1', color: '#000000', size: 8, tool: 'brush', points: [1, 1] };

function fakeHandle(): { handle: DrawingCanvasHandle; calls: string[] } {
  const calls: string[] = [];
  const handle: DrawingCanvasHandle = {
    applyStrokeStart: (p) => calls.push(`start:${p.id}`),
    applyStrokePoints: (p) => calls.push(`points:${p.id}:${p.points.length}`),
    applyStrokeEnd: (p) => calls.push(`end:${p.id}`),
    undo: () => calls.push('undo'),
    clear: () => calls.push('clear'),
    load: (s) => calls.push(`load:${s.length}`),
    getStrokes: () => [],
  };
  return { handle, calls };
}

describe('CanvasBridge', () => {
  it('con el lienzo conectado aplica cada comando al instante', () => {
    const bridge = new CanvasBridge();
    const { handle, calls } = fakeHandle();
    bridge.setHandle(handle);
    bridge.dispatch({ type: 'strokeStart', payload: stroke });
    bridge.dispatch({ type: 'strokePoints', payload: { id: 's1', points: [2, 2] } });
    bridge.dispatch({ type: 'strokeEnd', payload: { id: 's1' } });
    bridge.dispatch({ type: 'undo' });
    bridge.dispatch({ type: 'clear' });
    expect(calls).toEqual(['start:s1', 'points:s1:2', 'end:s1', 'undo', 'clear']);
  });

  it('sin lienzo guarda los comandos y los aplica en orden al conectarlo', () => {
    const bridge = new CanvasBridge();
    bridge.dispatch({ type: 'load', strokes: [stroke] });
    bridge.dispatch({ type: 'strokePoints', payload: { id: 's1', points: [2, 2] } });
    bridge.dispatch({ type: 'strokeEnd', payload: { id: 's1' } });
    const { handle, calls } = fakeHandle();
    bridge.setHandle(handle);
    expect(calls).toEqual(['load:1', 'points:s1:2', 'end:s1']);
  });

  it('cargar o limpiar descarta lo pendiente anterior', () => {
    const bridge = new CanvasBridge();
    bridge.dispatch({ type: 'strokeStart', payload: stroke });
    bridge.dispatch({ type: 'clear' });
    bridge.dispatch({ type: 'strokeStart', payload: { ...stroke, id: 's2' } });
    const { handle, calls } = fakeHandle();
    bridge.setHandle(handle);
    expect(calls).toEqual(['clear', 'start:s2']);
  });

  it('lo pendiente se aplica una sola vez', () => {
    const bridge = new CanvasBridge();
    bridge.dispatch({ type: 'clear' });
    const first = fakeHandle();
    bridge.setHandle(first.handle);
    bridge.setHandle(null);
    const second = fakeHandle();
    bridge.setHandle(second.handle);
    expect(first.calls).toEqual(['clear']);
    expect(second.calls).toEqual([]);
  });
});
