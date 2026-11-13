// Compartir el enlace de la sala: Web Share API con respaldo a copiar al portapapeles.

export type ShareData = { url: string; title: string; text: string };

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Las capacidades del navegador, inyectables para poder probar sin DOM. */
export type ShareEnv = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  writeText?: (text: string) => Promise<void>;
};

/** Ruta de entrada por enlace (la rutea T6). */
export function roomSharePath(code: string): string {
  return `/sala/${code}`;
}

export function roomShareUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}${roomSharePath(code)}`;
}

/** Lee las capacidades de `navigator` en el momento de llamar (no al importar el módulo). */
export function browserShareEnv(): ShareEnv {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator;
  return {
    share: typeof nav.share === 'function' ? (d) => nav.share(d) : undefined,
    canShare: typeof nav.canShare === 'function' ? (d) => nav.canShare(d) : undefined,
    writeText: nav.clipboard?.writeText ? (t) => nav.clipboard.writeText(t) : undefined,
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Intenta compartir con el panel nativo (teléfonos); si no existe o falla, copia el enlace.
 * `cancelled` significa que la persona cerró el panel: no es un error.
 */
export async function shareLink(
  data: ShareData,
  env: ShareEnv = browserShareEnv(),
): Promise<ShareOutcome> {
  if (env.share && (!env.canShare || env.canShare(data))) {
    try {
      await env.share(data);
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      // Cualquier otro fallo del panel nativo: se intenta copiar.
    }
  }
  if (env.writeText) {
    try {
      await env.writeText(data.url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
