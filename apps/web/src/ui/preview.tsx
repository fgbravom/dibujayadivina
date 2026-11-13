// Vista previa de las pantallas con datos simulados: /ui-preview.html (solo desarrollo).
// Elige la variante con el selector o con el hash de la URL (por ejemplo #drawing-guesser).

import { StrictMode, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { VARIANTS } from './preview/variants';

const BAR_PX = 44;

function idFromHash(): string {
  const id = window.location.hash.replace(/^#/, '');
  return VARIANTS.some((v) => v.id === id) ? id : (VARIANTS[0]?.id ?? '');
}

function PreviewApp() {
  const [id, setId] = useState(idFromHash);
  const [lastEvent, setLastEvent] = useState('');
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.id === id),
  );
  const variant = VARIANTS[index];

  const select = useCallback((next: string) => {
    window.location.hash = next;
    setId(next);
    setLastEvent('');
  }, []);

  useEffect(() => {
    const onHash = () => setId(idFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const step = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    if (next) select(next.id);
  };

  // El `transform` convierte este contenedor en el bloque contenedor de los elementos `fixed`
  // (la pantalla de juego), y las variables acotan el alto de las pantallas a lo que sobra de la barra.
  const stageStyle = {
    height: `calc(100dvh - ${BAR_PX}px)`,
    '--app-h': `calc(100dvh - ${BAR_PX}px)`,
    '--app-top': '0px',
    transform: 'translateZ(0)',
  } as CSSProperties;

  return (
    <>
      <div
        data-testid="preview-bar"
        className="flex items-center gap-2 border-b-2 border-ink bg-ink px-2 text-white"
        style={{ height: BAR_PX }}
      >
        <button
          type="button"
          aria-label="Variante anterior"
          onClick={() => step(-1)}
          className="size-9 shrink-0 rounded-lg border-2 border-white/40 font-black"
        >
          ‹
        </button>
        <label htmlFor="variant" className="sr-only">
          Variante de pantalla
        </label>
        <select
          id="variant"
          value={id}
          onChange={(e) => select(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border-2 border-white/40 bg-ink px-2 text-sm font-bold text-white"
        >
          {VARIANTS.map((v, i) => (
            <option key={v.id} value={v.id}>
              {i + 1}. {v.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Variante siguiente"
          onClick={() => step(1)}
          className="size-9 shrink-0 rounded-lg border-2 border-white/40 font-black"
        >
          ›
        </button>
        <output
          data-testid="last-event"
          className="hidden max-w-[40%] truncate text-xs font-bold text-white/80 md:block"
        >
          {lastEvent}
        </output>
      </div>
      <div
        data-testid="preview-stage"
        className="relative overflow-y-auto overflow-x-hidden"
        style={stageStyle}
      >
        {variant && <div key={variant.id}>{variant.render(setLastEvent)}</div>}
      </div>
    </>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PreviewApp />
    </StrictMode>,
  );
}
