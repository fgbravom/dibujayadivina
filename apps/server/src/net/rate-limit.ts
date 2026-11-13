// Límite de frecuencia por socket: una cubeta de fichas por categoría.

import { MAX_STROKE_MESSAGES_PER_SECOND, MAX_TEXT_MESSAGES_PER_SECOND } from '@dya/shared';

/** Control: crear/entrar a sala, ajustes, iniciar y elegir palabra. No está en el contrato; tope propio. */
const MAX_CONTROL_MESSAGES_PER_SECOND = 10;

export type Bucket = 'stroke' | 'text' | 'control';

/** Cubeta de fichas: capacidad igual a la tasa por segundo, que se repone de forma continua. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = perSecond;
    this.last = now;
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    this.tokens = Math.min(this.perSecond, this.tokens + (elapsed * this.perSecond) / 1000);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class SocketLimiter {
  private readonly buckets: Record<Bucket, TokenBucket>;

  constructor(now: number) {
    this.buckets = {
      stroke: new TokenBucket(MAX_STROKE_MESSAGES_PER_SECOND, now),
      text: new TokenBucket(MAX_TEXT_MESSAGES_PER_SECOND, now),
      control: new TokenBucket(MAX_CONTROL_MESSAGES_PER_SECOND, now),
    };
  }

  allow(bucket: Bucket, now: number): boolean {
    return this.buckets[bucket].take(now);
  }
}
