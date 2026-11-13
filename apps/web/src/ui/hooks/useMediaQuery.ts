import { useSyncExternalStore } from 'react';

/**
 * Escritorio: ancho de sobra y alto normal. Es el mismo criterio de la variante `desk` de
 * `index.css`; ahí la partida usa tres columnas y la barra de herramientas va desplegada entera.
 */
export const DESK_QUERY = '(min-width: 1024px) and (min-height: 501px)';

/**
 * Teléfono apaisado: mucho más ancho que alto y poco alto. Es el criterio de la variante `land` de
 * `index.css`. Pide proporción >= 3:2 para que un teléfono vertical con el teclado abierto (poco
 * alto, pero más alto que ancho) nunca se tome por apaisado.
 */
export const LAND_QUERY = '(min-aspect-ratio: 3/2) and (max-height: 500px)';

/** Sigue una media query. Sin `matchMedia` (pruebas, servidor) devuelve `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () =>
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
    () => false,
  );
}
