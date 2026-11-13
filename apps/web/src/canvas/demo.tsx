// Página de demostración (/canvas-demo.html): un lienzo dibujante y uno espectador.
// Lo dibujado en el primero llega al segundo solo por los callbacks y el handle, como pasaría por la red.

import { DEFAULT_STROKE_COLOR, DEFAULT_STROKE_SIZE } from '@dya/shared';
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { CanvasToolbar } from './CanvasToolbar';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import type { DrawingTool } from './types';

type Stats = {
  start: number;
  points: number;
  end: number;
  undo: number;
  clear: number;
  maxPairs: number;
};

const EMPTY_STATS: Stats = { start: 0, points: 0, end: 0, undo: 0, clear: 0, maxPairs: 0 };

function Demo() {
  const drawerRef = useRef<DrawingCanvasHandle>(null);
  const spectatorRef = useRef<DrawingCanvasHandle>(null);
  const [tool, setTool] = useState<DrawingTool>({
    color: DEFAULT_STROKE_COLOR,
    size: DEFAULT_STROKE_SIZE,
    tool: 'brush',
  });
  const [lag, setLag] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  /** "Envía" al espectador: copia profunda (como una serialización) y retraso opcional. */
  const send = (action: (target: DrawingCanvasHandle) => void) => {
    const run = () => {
      if (spectatorRef.current) action(spectatorRef.current);
    };
    if (lag) setTimeout(run, 150);
    else run();
  };

  const bump = (patch: (s: Stats) => Stats) => setStats(patch);

  return (
    <main className="mx-auto max-w-5xl p-3 sm:p-6">
      <h1 className="text-lg font-semibold text-slate-900">Demo del lienzo</h1>
      <p className="mb-3 text-sm text-slate-600">
        Dibuja a la izquierda; el espectador solo recibe los mensajes del contrato.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Dibujante">
          <h2 className="text-sm font-medium text-slate-700">Dibujante</h2>
          <DrawingCanvas
            ref={drawerRef}
            mode="drawer"
            tool={tool}
            ariaLabel="Lienzo del dibujante"
            onStrokeStart={(p) => {
              const copy = structuredClone(p);
              bump((s) => ({ ...s, start: s.start + 1 }));
              send((t) => t.applyStrokeStart(copy));
            }}
            onStrokePoints={(p) => {
              const copy = structuredClone(p);
              const pairs = copy.points.length / 2;
              bump((s) => ({ ...s, points: s.points + 1, maxPairs: Math.max(s.maxPairs, pairs) }));
              send((t) => t.applyStrokePoints(copy));
            }}
            onStrokeEnd={(p) => {
              const copy = structuredClone(p);
              bump((s) => ({ ...s, end: s.end + 1 }));
              send((t) => t.applyStrokeEnd(copy));
            }}
          />
          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            onUndo={() => {
              drawerRef.current?.undo();
              bump((s) => ({ ...s, undo: s.undo + 1 }));
              send((t) => t.undo());
            }}
            onClear={() => {
              drawerRef.current?.clear();
              bump((s) => ({ ...s, clear: s.clear + 1 }));
              send((t) => t.clear());
            }}
          />
        </section>

        <section className="flex min-w-0 flex-col gap-3" aria-label="Espectador">
          <h2 className="text-sm font-medium text-slate-700">Espectador</h2>
          <DrawingCanvas
            ref={spectatorRef}
            mode="spectator"
            tool={tool}
            ariaLabel="Lienzo del espectador"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={lag} onChange={(e) => setLag(e.target.checked)} />
              Simular red lenta (150 ms)
            </label>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              onClick={() => {
                const strokes = drawerRef.current?.getStrokes() ?? [];
                spectatorRef.current?.load(strokes);
              }}
            >
              Cargar historial en el espectador
            </button>
          </div>
          <p data-testid="stats" className="text-xs text-slate-500">
            Mensajes: start {stats.start}, points {stats.points} (máx. {stats.maxPairs} pares), end{' '}
            {stats.end}, undo {stats.undo}, clear {stats.clear}
          </p>
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
