import { useEffect, useSyncExternalStore } from 'react';

/** Bajo este alto (px) se considera pantalla "compacta": teclado abierto o teléfono apaisado. */
export const COMPACT_HEIGHT_PX = 460;

export type ViewportInfo = {
  /** Alto del área visible; `null` si el navegador no soporta `visualViewport`. */
  height: number | null;
  /** Hay poco alto disponible: conviene soltar adornos para que quepan el lienzo y el campo de texto. */
  compact: boolean;
};

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener('resize', onChange);
  vv.addEventListener('scroll', onChange);
  return () => {
    vv.removeEventListener('resize', onChange);
    vv.removeEventListener('scroll', onChange);
  };
}

// Un solo número estable como snapshot: alto en px.
function getHeight(): number | null {
  const vv = window.visualViewport;
  return vv ? Math.round(vv.height) : null;
}

function getOffsetTop(): number {
  const vv = window.visualViewport;
  return vv ? Math.round(vv.offsetTop) : 0;
}

const getServerHeight = () => null;

/**
 * Mantiene `--app-h` y `--app-top` (en `<html>`) iguales al área visible. En móvil, el teclado
 * achica el `visualViewport` pero no el viewport de diseño, y `100dvh` no lo refleja en iOS:
 * así la pantalla de juego se ajusta sobre el teclado y el campo de texto queda a la vista.
 * Úsalo una vez en la pantalla que quiere ese comportamiento (la de juego).
 */
export function useVisualViewport(): ViewportInfo {
  const height = useSyncExternalStore(subscribe, getHeight, getServerHeight);
  const offsetTop = useSyncExternalStore(subscribe, getOffsetTop, () => 0);

  useEffect(() => {
    const root = document.documentElement;
    if (height !== null) {
      root.style.setProperty('--app-h', `${height}px`);
      root.style.setProperty('--app-top', `${offsetTop}px`);
    }
    return () => {
      root.style.removeProperty('--app-h');
      root.style.removeProperty('--app-top');
    };
  }, [height, offsetTop]);

  const effectiveHeight = height ?? (typeof window === 'undefined' ? null : window.innerHeight);
  return {
    height,
    compact: effectiveHeight !== null && effectiveHeight < COMPACT_HEIGHT_PX,
  };
}
