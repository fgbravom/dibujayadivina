// Ayudas para las pruebas de integración de la red (solo las importan las pruebas).

import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomAck, ServerToClientEvents } from '@dya/shared';
import { createGameServer } from './server.js';
import type { GameServer, GameServerOptions } from './server.js';

export const TEST_WORDS = [
  'huemul',
  'sopaipilla',
  'copihue',
  'volantin',
  'cueca',
  'guata',
  'polera',
  'empanada',
  'pehuen',
];

const silentLogger = { error: () => undefined, info: () => undefined };

const servers: GameServer[] = [];
const clients: TestClient[] = [];

/** Servidor en un puerto libre y con tiempos cortos; se cierra con `closeAll`. */
export async function startServer(options: GameServerOptions = {}): Promise<GameServer> {
  const server = await createGameServer({
    port: 0,
    host: '127.0.0.1',
    webDir: null,
    chooseMs: 1000,
    drawMs: 3000,
    turnEndMs: 250,
    graceMs: 1500,
    words: TEST_WORDS,
    logger: silentLogger,
    ...options,
  });
  servers.push(server);
  return server;
}

export async function closeAll(): Promise<void> {
  for (const client of clients.splice(0)) client.close();
  await Promise.all(servers.splice(0).map((s) => s.close()));
}

interface Entry {
  event: string;
  payload: unknown;
  taken: boolean;
}

interface Waiter {
  event: string;
  predicate: (payload: never) => boolean;
  resolve: (payload: never) => void;
}

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Cliente de pruebas: registra todo lo que recibe y permite esperar eventos sin perderse los ya llegados. */
export class TestClient {
  readonly socket: ClientSocket;
  readonly log: Entry[] = [];
  playerId = '';
  private waiters: Waiter[] = [];

  constructor(url: string, extraHeaders: Record<string, string> = {}) {
    this.socket = io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders,
    });
    this.socket.onAny((event: string, ...args: unknown[]) => this.record(event, args[0]));
    this.socket.on('disconnect', (reason) => this.record('disconnect', reason));
    clients.push(this);
  }

  private record(event: string, payload: unknown): void {
    const entry: Entry = { event, payload, taken: false };
    this.log.push(entry);
    for (const waiter of [...this.waiters]) {
      if (waiter.event !== event || entry.taken || !waiter.predicate(payload as never)) continue;
      entry.taken = true;
      this.waiters = this.waiters.filter((w) => w !== waiter);
      waiter.resolve(payload as never);
    }
  }

  connected(): Promise<this> {
    if (this.socket.connected) return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve(this));
      this.socket.once('connect_error', reject);
    });
  }

  /** Espera el primer evento sin consumir que cumpla el predicado (incluso uno ya recibido) y lo consume. */
  waitFor<T = unknown>(
    event: string,
    predicate: (payload: T) => boolean = () => true,
    timeoutMs = 4000,
  ): Promise<T> {
    const index = this.log.findIndex(
      (e) => !e.taken && e.event === event && predicate(e.payload as T),
    );
    const found = this.log[index];
    if (found) {
      found.taken = true;
      return Promise.resolve(found.payload as T);
    }
    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter = {
        event,
        predicate: predicate as (payload: never) => boolean,
        resolve: (payload) => {
          clearTimeout(timer);
          resolve(payload as T);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        const seen = this.log
          .slice(-12)
          .map((e) => `${e.event}${e.taken ? '' : '*'}`)
          .join(', ');
        reject(new Error(`Timeout esperando "${event}" (últimos eventos: ${seen})`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /** Eventos recibidos de un tipo, sin importar si ya se consumieron. */
  received<T = unknown>(event: string): T[] {
    return this.log.filter((e) => e.event === event).map((e) => e.payload as T);
  }

  /** Emite con acuse. */
  ack(event: 'room:create' | 'room:join', payload: unknown): Promise<RoomAck> {
    return new Promise((resolve) => {
      (this.socket as unknown as { emit: (...args: unknown[]) => void }).emit(
        event,
        payload,
        (res: RoomAck) => resolve(res),
      );
    });
  }

  emit(event: string, payload?: unknown): void {
    const socket = this.socket as unknown as { emit: (...args: unknown[]) => void };
    if (payload === undefined) socket.emit(event);
    else socket.emit(event, payload);
  }

  close(): void {
    this.socket.disconnect();
  }
}

/** Conecta un cliente; `extraHeaders` simula lo que añadiría un proxy (o un navegador, como `origin`). */
export async function connect(
  server: GameServer,
  extraHeaders: Record<string, string> = {},
): Promise<TestClient> {
  return new TestClient(server.url, extraHeaders).connected();
}

export interface Lobby {
  code: string;
  players: TestClient[];
  names: string[];
  sessionIds: string[];
}

const NAMES = ['Ana', 'Beto', 'Caro', 'Dani'];

export function sessionIdFor(index: number): string {
  return `sesion-de-prueba-${index}`;
}

/** Crea una sala con `count` jugadores conectados; el primero es el anfitrión. */
export async function createLobby(server: GameServer, count = 3): Promise<Lobby> {
  const players: TestClient[] = [];
  let code = '';
  for (let i = 0; i < count; i++) {
    const client = await connect(server);
    const name = NAMES[i] ?? `Jugador${i}`;
    const payload = { name, sessionId: sessionIdFor(i) };
    const res =
      i === 0
        ? await client.ack('room:create', payload)
        : await client.ack('room:join', { ...payload, code });
    if (!res.ok) throw new Error(`No se pudo entrar a la sala: ${res.error}`);
    client.playerId = res.playerId;
    if (i === 0) code = res.code;
    players.push(client);
  }
  // Cada uno debe haber recibido su foto antes de seguir.
  await Promise.all(players.map((p) => p.waitFor('room:state')));
  return {
    code,
    players,
    names: players.map((_, i) => NAMES[i] ?? `Jugador${i}`),
    sessionIds: players.map((_, i) => sessionIdFor(i)),
  };
}
