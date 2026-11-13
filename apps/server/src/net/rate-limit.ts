// Límites de frecuencia: cubetas por socket (antes de entrar a una sala), por jugador (dentro de
// la sala) y topes por dirección IP.

import { MAX_STROKE_MESSAGES_PER_SECOND, MAX_TEXT_MESSAGES_PER_SECOND } from '@dya/shared';

/** Control: ajustes, iniciar y elegir palabra. No está en el contrato; tope propio. */
const MAX_CONTROL_MESSAGES_PER_SECOND = 10;
/** Entrada: `room:create` y `room:join`. Ráfaga de 3 y una ficha nueva cada 2 segundos. */
const ENTRY_BURST = 3;
const ENTRY_REFILL_PER_SECOND = 0.5;

export type Bucket = 'stroke' | 'text' | 'control' | 'entry';
/** Las cubetas que viven en el jugador de una sala: no se rellenan al cambiar de socket. */
export type PlayerBucket = 'stroke' | 'text';

/** Cubeta de fichas: `capacity` (por defecto igual a la tasa por segundo) que se repone de forma continua. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perSecond: number,
    now: number,
    private readonly capacity: number = perSecond,
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.perSecond) / 1000);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

function playerBuckets(now: number): Record<PlayerBucket, TokenBucket> {
  return {
    stroke: new TokenBucket(MAX_STROKE_MESSAGES_PER_SECOND, now),
    text: new TokenBucket(MAX_TEXT_MESSAGES_PER_SECOND, now),
  };
}

/** Cubetas de un socket. Dentro de una sala, trazos y texto se limitan por jugador (`PlayerLimiter`). */
export class SocketLimiter {
  private readonly buckets: Record<Bucket, TokenBucket>;

  constructor(now: number) {
    this.buckets = {
      ...playerBuckets(now),
      control: new TokenBucket(MAX_CONTROL_MESSAGES_PER_SECOND, now),
      entry: new TokenBucket(ENTRY_REFILL_PER_SECOND, now, ENTRY_BURST),
    };
  }

  allow(bucket: Bucket, now: number): boolean {
    return this.buckets[bucket].take(now);
  }
}

/** Cubetas de trazos y texto de un jugador dentro de una sala; sobreviven al cambio de socket. */
export class PlayerLimiter {
  private readonly buckets: Record<PlayerBucket, TokenBucket>;

  constructor(now: number) {
    this.buckets = playerBuckets(now);
  }

  allow(bucket: PlayerBucket, now: number): boolean {
    return this.buckets[bucket].take(now);
  }
}

export interface IpLimits {
  /** Conexiones simultáneas por IP. */
  maxConnections: number;
  /** Salas creadas por IP en `windowMs`. */
  maxRoomsPerWindow: number;
  windowMs: number;
}

export const DEFAULT_IP_LIMITS: IpLimits = {
  maxConnections: 40,
  maxRoomsPerWindow: 10,
  windowMs: 60_000,
};

/** Si el registro de creaciones pasa de este tamaño, se purgan las IP sin creaciones recientes. */
const SWEEP_THRESHOLD = 1000;

/** Topes por dirección IP: conexiones abiertas y salas creadas en una ventana de tiempo. */
export class IpLimiter {
  private readonly limits: IpLimits;
  private readonly connections = new Map<string, number>();
  private readonly creations = new Map<string, number[]>();

  constructor(limits: Partial<IpLimits> = {}) {
    this.limits = { ...DEFAULT_IP_LIMITS, ...limits };
  }

  canConnect(ip: string): boolean {
    return (this.connections.get(ip) ?? 0) < this.limits.maxConnections;
  }

  connected(ip: string): void {
    this.connections.set(ip, (this.connections.get(ip) ?? 0) + 1);
  }

  disconnected(ip: string): void {
    const left = (this.connections.get(ip) ?? 0) - 1;
    if (left > 0) this.connections.set(ip, left);
    else this.connections.delete(ip);
  }

  connectionCount(ip: string): number {
    return this.connections.get(ip) ?? 0;
  }

  /** Cuenta una sala creada por `ip`; false (sin contarla) si ya llegó al tope de la ventana. */
  allowRoomCreation(ip: string, now: number): boolean {
    if (this.creations.size > SWEEP_THRESHOLD) this.sweep(now);
    const recent = this.recent(ip, now);
    if (recent.length >= this.limits.maxRoomsPerWindow) return false;
    recent.push(now);
    this.creations.set(ip, recent);
    return true;
  }

  private recent(ip: string, now: number): number[] {
    const since = now - this.limits.windowMs;
    return (this.creations.get(ip) ?? []).filter((t) => t > since);
  }

  private sweep(now: number): void {
    for (const ip of [...this.creations.keys()]) {
      const recent = this.recent(ip, now);
      if (recent.length === 0) this.creations.delete(ip);
      else this.creations.set(ip, recent);
    }
  }
}

/**
 * Dirección del cliente. Con `header` configurado (detrás de un proxy de confianza) se toma de esa
 * cabecera; si trae una lista separada por comas, vale la última (la que añadió el proxy más
 * cercano). Sin cabecera configurada no se confía en ninguna: se usa la dirección de la conexión.
 */
export function clientIp(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: string | undefined,
  header: string | null,
): string {
  if (header) {
    const raw = headers[header];
    const value = (Array.isArray(raw) ? raw[raw.length - 1] : raw)?.split(',').at(-1)?.trim();
    if (value) return value;
  }
  return remoteAddress ?? 'unknown';
}
