// Detección de versiones nuevas del cliente, sin tocar el DOM ni la red (eso vive en `updater.ts`).
// La "versión" es la URL del script principal con hash que Vite inyecta en `index.html`
// (`/assets/index-XXXX.js`): cambia en cada despliegue.

/** Cada cuánto se comprueba mientras la pestaña está visible. */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** Al volver a la pestaña solo se comprueba si pasó más que esto desde la última comprobación. */
export const VISIBLE_RECHECK_MS = 5 * 60 * 1000;

const COMMENT = /<!--[\s\S]*?-->/g;
const SCRIPT_TAG = /<script\b([^>]*)>/gi;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributesOf(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(ATTRIBUTE)) {
    const name = match[1]!.toLowerCase();
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/**
 * URL (sin query ni fragmento) del primer `<script type="module" src="….js">` del HTML, o `null`
 * si no hay. El HTML de desarrollo de Vite (`/src/main.tsx`, `/@vite/client`) no cuenta: no tiene
 * versión.
 */
export function extractEntryScript(html: string): string | null {
  for (const tag of html.replace(COMMENT, '').matchAll(SCRIPT_TAG)) {
    const attributes = attributesOf(tag[1] ?? '');
    if (attributes.get('type')?.toLowerCase() !== 'module') continue;
    const src = attributes.get('src')?.split(/[?#]/)[0];
    if (src && /\.m?js$/i.test(src)) return src;
  }
  return null;
}

export type UpdateDecision = 'none' | 'reload' | 'notify';

export type UpdateInput = {
  /** Versión del documento en ejecución (`null` si no se pudo leer). */
  running: string | null;
  /** Versión del `index.html` publicado (`null` si no se pudo leer). */
  published: string | null;
  /** Hay una sala (o una entrada a una sala) en curso: no se recarga sola. */
  inRoom: boolean;
  /** Versión por la que esta pestaña ya se recargó sola. */
  reloadedFor: string | null;
};

/** Hay una versión publicada distinta de la que corre (si falta alguna de las dos, no se sabe). */
export function isOutdated(running: string | null, published: string | null): boolean {
  return running !== null && published !== null && running !== published;
}

/**
 * Qué hacer con lo comprobado: nada, recargar sola (en el inicio, una sola vez por versión
 * publicada) o avisar (dentro de una sala, donde recargar interrumpiría la partida).
 */
export function decideUpdate({
  running,
  published,
  inRoom,
  reloadedFor,
}: UpdateInput): UpdateDecision {
  if (!isOutdated(running, published)) return 'none';
  if (inRoom) return 'notify';
  return reloadedFor === published ? 'none' : 'reload';
}

/** Al volver a ver la pestaña: comprobar si pasó más de `VISIBLE_RECHECK_MS` desde la última vez. */
export function shouldCheckOnVisible(now: number, lastCheckAt: number | null): boolean {
  return lastCheckAt === null || now - lastCheckAt > VISIBLE_RECHECK_MS;
}
