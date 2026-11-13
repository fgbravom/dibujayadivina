// Cuenta regresiva: funciones puras. El hook `useCountdown` solo las llama con la hora actual.

/** En los últimos segundos el reloj entra en estado de urgencia. */
export const URGENT_SECONDS = 10;

/**
 * Desfase entre el reloj del servidor y el local: `serverNow - clientNow`, medido al recibir
 * `RoomState.serverNow`. La hora del servidor estimada es `Date.now() + offset`.
 */
export function computeServerOffset(serverNow: number, clientNow: number): number {
  return serverNow - clientNow;
}

/** Segundos que faltan para `endsAt` (hora del servidor), redondeados hacia arriba; nunca negativo. */
export function secondsRemaining(
  endsAt: number,
  serverOffsetMs: number,
  clientNow: number,
): number {
  const remainingMs = endsAt - (clientNow + serverOffsetMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function isUrgent(seconds: number | null): boolean {
  return seconds !== null && seconds <= URGENT_SECONDS;
}

/** `80` -> `1:20`, `9` -> `0:09`. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Texto para lectores de pantalla: `80` -> `1 minuto 20 segundos`. */
export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return plural(rest, 'segundo', 'segundos');
  if (rest === 0) return plural(minutes, 'minuto', 'minutos');
  return `${plural(minutes, 'minuto', 'minutos')} ${plural(rest, 'segundo', 'segundos')}`;
}
