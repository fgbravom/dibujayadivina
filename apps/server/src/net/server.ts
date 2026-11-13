// Servidor de red: http + Socket.IO tipado, registro de salas y conexión con el motor de reglas.
// Las reglas viven en `game/`; aquí solo se valida, se resuelve quién envía y se entregan los efectos.

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import {
  WORD_OPTIONS_COUNT,
  emptyPayloadSchema,
  messageSendSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomSettingsSchema,
  strokeEndSchema,
  strokePointsSchema,
  strokeStartSchema,
  wordChooseSchema,
} from '@dya/shared';
import type { ClientToServerEvents, ErrorCode, RoomAck, ServerToClientEvents } from '@dya/shared';
import { canDraw, createGame, nextWakeAt, reduce } from '../game/index.js';
import type {
  Action,
  Effect,
  EngineConfig,
  EnginePlayer,
  GameState,
  Recipient,
  ReduceResult,
} from '../game/index.js';
import { SocketLimiter } from './rate-limit.js';
import type { Bucket } from './rate-limit.js';
import { RoomRegistry } from './rooms.js';
import type { Room } from './rooms.js';
import { createStaticHandler } from './static.js';
import type { StrokeLimits, StrokeOutcome } from './strokes.js';
import { bankWordPicker, fixedWordPicker } from './words.js';

export interface GameServerOptions {
  /** Puerto; 0 elige uno libre. Por defecto 0. */
  port?: number;
  host?: string;
  /** Carpeta del cliente compilado. Por defecto `apps/web/dist`; `null` desactiva el servido estático. */
  webDir?: string | null;
  /** Tope de salas simultáneas. Por defecto 500. */
  maxRooms?: number;
  /** Solo pruebas: duración de elegir palabra, de dibujar (reemplaza los ajustes), pausa de fin de turno y gracia de reconexión, en ms. */
  chooseMs?: number;
  drawMs?: number;
  turnEndMs?: number;
  graceMs?: number;
  /** Solo pruebas: lista fija de palabras para que las opciones sean deterministas. */
  words?: string[];
  rng?: () => number;
  strokeLimits?: Partial<StrokeLimits>;
  /** Registro de errores y avisos; por defecto `console`. */
  logger?: Pick<Console, 'error' | 'info'>;
}

export interface GameServer {
  port: number;
  /** Origen para conectar clientes, p. ej. `http://127.0.0.1:41233`. */
  url: string;
  roomCount(): number;
  close(): Promise<void>;
}

type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Socket sin los tipos del contrato, para emitir y escuchar por nombre de evento resuelto en ejecución. */
interface LooseSocket {
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

interface Session {
  socket: GameSocket;
  roomCode: string | null;
  playerId: string | null;
  limiter: SocketLimiter;
}

const DEFAULT_MAX_ROOMS = 500;
/** Un setTimeout no admite más de 2^31-1 ms. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** Un mensaje legítimo pesa del orden de 1 KB (64 puntos); el tope por defecto de Socket.IO es 1 MB. */
const MAX_BUFFER_BYTES = 64 * 1024;

const DEFAULT_WEB_DIR = fileURLToPath(new URL('../../../web/dist', import.meta.url));

export async function createGameServer(options: GameServerOptions = {}): Promise<GameServer> {
  const logger = options.logger ?? console;
  const rng = options.rng ?? Math.random;
  const now = (): number => Date.now();

  if (options.words !== undefined && options.words.length < WORD_OPTIONS_COUNT) {
    throw new Error(`words necesita al menos ${WORD_OPTIONS_COUNT} palabras`);
  }
  const pickWords = options.words ? fixedWordPicker(options.words) : bankWordPicker(rng);

  const engineConfig: Partial<EngineConfig> = {};
  if (options.chooseMs !== undefined) engineConfig.chooseMs = options.chooseMs;
  if (options.drawMs !== undefined) engineConfig.drawMsOverride = options.drawMs;
  if (options.turnEndMs !== undefined) engineConfig.turnEndMs = options.turnEndMs;
  if (options.graceMs !== undefined) engineConfig.graceMs = options.graceMs;

  const registry = new RoomRegistry(
    options.maxRooms ?? DEFAULT_MAX_ROOMS,
    rng,
    options.strokeLimits ?? {},
  );
  const sessions = new Map<string, Session>();

  // --- HTTP -----------------------------------------------------------------

  const webDir = options.webDir === undefined ? DEFAULT_WEB_DIR : options.webDir;
  const serveStatic = webDir === null ? null : createStaticHandler(webDir);

  const httpServer = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (!serveStatic) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    serveStatic(req, res).catch((err: unknown) => {
      logger.error('[http] error al servir archivo', err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  const io: GameIo = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    serveClient: false,
    maxHttpBufferSize: MAX_BUFFER_BYTES,
  });

  // --- Entrega de efectos ---------------------------------------------------

  function sendTo(connId: string, event: string, payload?: unknown): void {
    const socket = io.sockets.sockets.get(connId) as unknown as LooseSocket | undefined;
    if (!socket) return;
    if (payload === undefined) socket.emit(event);
    else socket.emit(event, payload);
  }

  function sendError(socket: GameSocket, code: ErrorCode): void {
    socket.emit('system:error', { code });
  }

  function connectionOf(player: EnginePlayer | undefined): string[] {
    return player?.connected && player.connId !== null ? [player.connId] : [];
  }

  function connIdsFor(state: GameState, to: Recipient): string[] {
    switch (to.kind) {
      case 'room':
        return state.players.flatMap((p) => connectionOf(p));
      case 'roomExcept':
        return state.players.filter((p) => p.id !== to.playerId).flatMap((p) => connectionOf(p));
      case 'player':
        return connectionOf(state.players.find((p) => p.id === to.playerId));
      case 'players': {
        const ids = new Set(to.playerIds);
        return state.players.filter((p) => ids.has(p.id)).flatMap((p) => connectionOf(p));
      }
    }
  }

  function execute(room: Room, state: GameState, effect: Effect): void {
    switch (effect.type) {
      case 'emit':
        for (const connId of connIdsFor(state, effect.to)) {
          sendTo(connId, effect.event, effect.payload);
        }
        break;
      case 'snapshot': {
        const player = state.players.find((p) => p.id === effect.playerId);
        for (const connId of connectionOf(player)) {
          sendTo(connId, 'room:state', {
            ...effect.snapshot,
            code: room.code,
            strokes: [...room.strokes.list],
          });
        }
        break;
      }
      case 'strokes:reset':
        room.strokes.reset();
        break;
      case 'disconnectConn':
        io.sockets.sockets.get(effect.connId)?.disconnect(true);
        break;
    }
  }

  // --- Salas y temporizador -------------------------------------------------

  function destroyRoom(room: Room, notify?: ErrorCode): void {
    const connIds = connIdsFor(room.state, { kind: 'room' });
    registry.delete(room);
    for (const connId of connIds) {
      const socket = io.sockets.sockets.get(connId);
      if (!socket) continue;
      if (notify) sendError(socket, notify);
      const session = sessions.get(connId);
      if (session) {
        session.roomCode = null;
        session.playerId = null;
      }
    }
  }

  function schedule(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const wakeAt = nextWakeAt(room.state);
    if (wakeAt === null) return;
    const delay = Math.min(Math.max(wakeAt - now(), 0), MAX_TIMEOUT_MS);
    room.timer = setTimeout(() => {
      room.timer = null;
      tick(room);
    }, delay);
  }

  /** Aplica una acción al motor, guarda el estado, entrega los efectos y reprograma el temporizador. */
  function run(room: Room, action: Action): ReduceResult {
    const ts = now();
    const result = reduce(room.state, action, {
      now: ts,
      rng,
      pickWords,
      newId: () => randomBytes(6).toString('hex'),
    });
    room.state = result.state;
    for (const effect of result.effects) execute(room, result.state, effect);
    if (registry.get(room.code) === room) {
      if (room.state.players.length === 0) registry.delete(room);
      else schedule(room);
    }
    return result;
  }

  function tick(room: Room): void {
    try {
      run(room, { type: 'tick' });
    } catch (err) {
      // Un fallo en el reloj de una sala la deja en un estado dudoso: se cierra solo esa sala.
      logger.error(`[sala ${room.code}] error en tick; se cierra la sala`, err);
      destroyRoom(room, 'internal');
    }
  }

  /** Si ya venció algo y el temporizador aún no corre, procesa los plazos antes de decidir permisos. */
  function sync(room: Room): void {
    const wakeAt = nextWakeAt(room.state);
    if (wakeAt !== null && wakeAt <= now()) tick(room);
  }

  function resolve(session: Session): { room: Room; player: EnginePlayer } | null {
    if (session.roomCode === null || session.playerId === null) return null;
    const room = registry.get(session.roomCode);
    const player = room?.state.players.find((p) => p.id === session.playerId);
    if (!room || !player || player.connId !== session.socket.id) return null;
    return { room, player };
  }

  function leaveRoom(code: string | null, playerId: string | null): void {
    if (code === null || playerId === null) return;
    const room = registry.get(code);
    if (room?.state.players.some((p) => p.id === playerId)) run(room, { type: 'leave', playerId });
  }

  // --- Entrada a una sala ---------------------------------------------------

  function enterRoom(
    session: Session,
    room: Room,
    payload: { name: string; sessionId: string },
    ack: (res: RoomAck) => void,
    isNew: boolean,
  ): void {
    const previous = { code: session.roomCode, playerId: session.playerId };
    const result = run(room, {
      type: 'join',
      sessionId: payload.sessionId,
      name: payload.name,
      connId: session.socket.id,
    });
    if (result.error || result.playerId === undefined) {
      if (isNew) registry.delete(room);
      ack({ ok: false, error: result.error ?? 'internal' });
      return;
    }
    session.roomCode = room.code;
    session.playerId = result.playerId;
    // Un socket está en una sola sala: se sale de la anterior solo después de entrar a la nueva.
    if (previous.code !== room.code || previous.playerId !== result.playerId) {
      leaveRoom(previous.code, previous.playerId);
    }
    ack({ ok: true, code: room.code, playerId: result.playerId });
  }

  // --- Registro de manejadores ----------------------------------------------

  function guard(socket: GameSocket, ack: ((res: RoomAck) => void) | null, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.error(`[socket ${socket.id}] error inesperado`, err);
      if (ack) ack({ ok: false, error: 'internal' });
      else sendError(socket, 'internal');
    }
  }

  io.on('connection', (socket) => {
    const session: Session = {
      socket,
      roomCode: null,
      playerId: null,
      limiter: new SocketLimiter(now()),
    };
    sessions.set(socket.id, session);
    const loose = socket as unknown as LooseSocket;

    /** Evento con acuse (`room:create`, `room:join`): errores por ack, nunca por `system:error`. */
    function onAcked<T>(
      event: string,
      schema: Schema<T>,
      handler: (payload: T, ack: (res: RoomAck) => void) => void,
    ): void {
      loose.on(event, (...args: unknown[]) => {
        const rawAck = args[args.length - 1];
        if (typeof rawAck !== 'function') return;
        const ack = (res: RoomAck): void => void (rawAck as (res: RoomAck) => void)(res);
        guard(socket, ack, () => {
          if (!session.limiter.allow('control', now()))
            return ack({ ok: false, error: 'rate_limited' });
          const parsed = schema.safeParse(args[0]);
          if (!parsed.success) return ack({ ok: false, error: 'invalid_payload' });
          handler(parsed.data, ack);
        });
      });
    }

    /** Evento sin acuse: límite de frecuencia, validación y solo entonces el manejador. */
    function onEvent<T>(
      event: string,
      bucket: Bucket,
      schema: Schema<T>,
      handler: (payload: T) => void,
    ): void {
      loose.on(event, (...args: unknown[]) => {
        guard(socket, null, () => {
          if (!session.limiter.allow(bucket, now())) return sendError(socket, 'rate_limited');
          const parsed = schema.safeParse(args[0]);
          if (!parsed.success) return sendError(socket, 'invalid_payload');
          handler(parsed.data);
        });
      });
    }

    /** Aplica una acción de jugador y, si el motor la rechaza, avisa solo a quien la envió. */
    function act(build: (playerId: string) => Action): void {
      const who = resolve(session);
      if (!who) return sendError(socket, 'not_in_room');
      const result = run(who.room, build(who.player.id));
      if (result.error) sendError(socket, result.error);
    }

    /** Trazos: solo el dibujante; se guardan en el historial y se reenvían al resto de la sala. */
    function drawerAction(
      apply: (room: Room) => StrokeOutcome,
      forward: (room: Room) => { event: string; payload?: unknown },
    ): void {
      const who = resolve(session);
      if (!who) return sendError(socket, 'not_in_room');
      sync(who.room);
      const fresh = resolve(session);
      if (!fresh) return sendError(socket, 'not_in_room');
      if (!canDraw(fresh.room.state, fresh.player.id)) return sendError(socket, 'not_drawer');
      const outcome = apply(fresh.room);
      if (outcome === 'too_many_strokes') return sendError(socket, 'too_many_strokes');
      if (outcome === 'ignored') return;
      const { event, payload } = forward(fresh.room);
      const to = connIdsFor(fresh.room.state, { kind: 'roomExcept', playerId: fresh.player.id });
      for (const connId of to) sendTo(connId, event, payload);
    }

    onAcked('room:create', roomCreateSchema, (payload, ack) => {
      const room = registry.create(createGame(engineConfig, {}));
      // No hay un código de error de "servidor lleno" en el contrato: se reutiliza `room_full`.
      if (!room) return ack({ ok: false, error: 'room_full' });
      enterRoom(session, room, payload, ack, true);
    });

    onAcked('room:join', roomJoinSchema, (payload, ack) => {
      const room = registry.get(payload.code);
      if (!room) return ack({ ok: false, error: 'room_not_found' });
      enterRoom(session, room, payload, ack, false);
    });

    onEvent('room:settings', 'control', roomSettingsSchema, (p) =>
      act((playerId) => ({
        type: 'updateSettings',
        playerId,
        rounds: p.rounds,
        drawSeconds: p.drawSeconds,
      })),
    );
    onEvent('game:start', 'control', emptyPayloadSchema, () =>
      act((playerId) => ({ type: 'start', playerId })),
    );
    onEvent('word:choose', 'control', wordChooseSchema, (p) =>
      act((playerId) => ({ type: 'chooseWord', playerId, index: p.index })),
    );
    onEvent('message:send', 'text', messageSendSchema, (p) =>
      act((playerId) => ({ type: 'message', playerId, text: p.text })),
    );

    onEvent('stroke:start', 'stroke', strokeStartSchema, (p) =>
      drawerAction(
        (room) => room.strokes.start(p),
        () => ({ event: 'stroke:start', payload: p }),
      ),
    );
    onEvent('stroke:points', 'stroke', strokePointsSchema, (p) =>
      drawerAction(
        (room) => room.strokes.addPoints(p.id, p.points),
        () => ({ event: 'stroke:points', payload: p }),
      ),
    );
    onEvent('stroke:end', 'stroke', strokeEndSchema, (p) =>
      drawerAction(
        (room) => room.strokes.end(p.id),
        () => ({ event: 'stroke:end', payload: p }),
      ),
    );
    onEvent('canvas:undo', 'stroke', emptyPayloadSchema, () =>
      drawerAction(
        (room) => room.strokes.undo(),
        () => ({ event: 'canvas:undo' }),
      ),
    );
    onEvent('canvas:clear', 'stroke', emptyPayloadSchema, () =>
      drawerAction(
        (room) => {
          room.strokes.clear();
          return 'ok';
        },
        () => ({ event: 'canvas:clear' }),
      ),
    );

    socket.on('disconnect', () => {
      sessions.delete(socket.id);
      guard(socket, null, () => {
        const who = resolve(session);
        if (!who) return;
        run(who.room, { type: 'disconnect', playerId: who.player.id, connId: socket.id });
      });
    });
  });

  // --- Arranque y cierre ----------------------------------------------------

  await new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(options.port ?? 0, options.host, () => {
      httpServer.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = httpServer.address() as AddressInfo;
  const host =
    options.host && options.host !== '0.0.0.0' && options.host !== '::'
      ? options.host
      : 'localhost';
  let closing: Promise<void> | null = null;

  return {
    port: address.port,
    url: `http://${host.includes(':') ? `[${host}]` : host}:${address.port}`,
    roomCount: () => registry.size,
    close() {
      closing ??= new Promise<void>((resolveClose) => {
        registry.clear();
        io.close(() => resolveClose());
        httpServer.closeAllConnections();
      });
      return closing;
    },
  };
}
