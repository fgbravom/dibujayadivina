// Detecta que quedó corriendo una versión antigua del cliente (una pestaña abierta durante un
// despliegue) y la actualiza: en el inicio recarga sola, dentro de una sala solo avisa. La
// decisión es pura (`version.ts`); aquí viven la red, los temporizadores y la recarga.

import {
  browserStorage,
  loadReloadedVersion,
  saveReloadedVersion,
  savePendingHomeError,
} from './identity';
import { useGameStore } from './store';
import {
  CHECK_INTERVAL_MS,
  decideUpdate,
  extractEntryScript,
  isOutdated,
  shouldCheckOnVisible,
} from './version';

const tab = browserStorage('session');

let isInRoom: () => boolean = () => false;
let inFlight = false;
let lastCheckAt: number | null = null;
let started = false;

/** Versión del documento en ejecución: el script principal que cargó esta página. */
function runningVersion(): string | null {
  const scripts = Array.from(document.scripts, (script) => script.outerHTML).join('\n');
  return extractEntryScript(scripts);
}

/** Versión publicada ahora, o `null` si no se pudo pedir (los errores de red se ignoran). */
async function publishedVersion(): Promise<{ version: string | null } | null> {
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) return null;
    return { version: extractEntryScript(await response.text()) };
  } catch {
    return null;
  }
}

/** Recarga la página por una versión nueva; el error visible del inicio sobrevive a la recarga. */
function reloadForUpdate(version: string): void {
  saveReloadedVersion(tab, version);
  const { homeError } = useGameStore.getState();
  if (homeError) savePendingHomeError(tab, homeError);
  window.location.reload();
}

/** Recarga desde el botón del aviso: la sala y la sesión guardadas devuelven a la persona a su sala. */
export function reloadNow(): void {
  window.location.reload();
}

/**
 * Comprueba si hay una versión publicada distinta. Nunca hay dos comprobaciones a la vez; en
 * desarrollo no hace nada.
 */
export async function checkForUpdate(): Promise<void> {
  if (import.meta.env.DEV || inFlight) return;
  inFlight = true;
  lastCheckAt = Date.now();
  try {
    const result = await publishedVersion();
    if (!result) return;
    const published = result.version;
    const running = runningVersion();
    const set = useGameStore.setState;
    if (!isOutdated(running, published)) {
      // Al día (o no se pudo leer la versión): no queda aviso pendiente.
      if (published !== null && running !== null) set({ newVersion: null });
      return;
    }
    const decision = decideUpdate({
      running,
      published,
      inRoom: isInRoom(),
      reloadedFor: loadReloadedVersion(tab),
    });
    if (decision === 'notify') set({ newVersion: published, updateDismissed: false });
    else if (decision === 'reload') reloadForUpdate(published!);
  } finally {
    inFlight = false;
  }
}

/**
 * Al quedar sin sala (la sala ya no existe, o la persona salió) con una versión nueva ya conocida:
 * recarga sola, una vez por versión.
 */
export function reloadIfOutdated(): void {
  const published = useGameStore.getState().newVersion;
  const decision = decideUpdate({
    running: runningVersion(),
    published,
    inRoom: false,
    reloadedFor: loadReloadedVersion(tab),
  });
  if (decision === 'reload') reloadForUpdate(published!);
}

/** Una sola vez: comprueba cada 10 minutos y al volver a la pestaña. `inRoom` dice si hay sala en curso. */
export function startUpdateChecker(inRoom: () => boolean): void {
  if (import.meta.env.DEV || started) return;
  started = true;
  isInRoom = inRoom;
  setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  }, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldCheckOnVisible(Date.now(), lastCheckAt)) {
      void checkForUpdate();
    }
  });
}
