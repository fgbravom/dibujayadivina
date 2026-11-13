// Eventos de Socket.IO: nombres y payloads tipados (PLAN.md sección 4).
// `ClientToServerEvents` y `ServerToClientEvents` se usan como genéricos de Socket.IO:
//   new Server<ClientToServerEvents, ServerToClientEvents>(...)
//   io<ServerToClientEvents, ClientToServerEvents>(...)

import type {
  MessageSendPayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomSettingsPayload,
  StrokeEndPayload,
  StrokePointsPayload,
  StrokeStartPayload,
  WordChoosePayload,
} from './schemas.js';
import type {
  ErrorCode,
  MessageChannel,
  Player,
  RankingEntry,
  RoomState,
  TurnEnd,
} from './types.js';

export const CLIENT_EVENTS = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_SETTINGS: 'room:settings',
  GAME_START: 'game:start',
  WORD_CHOOSE: 'word:choose',
  STROKE_START: 'stroke:start',
  STROKE_POINTS: 'stroke:points',
  STROKE_END: 'stroke:end',
  CANVAS_UNDO: 'canvas:undo',
  CANVAS_CLEAR: 'canvas:clear',
  MESSAGE_SEND: 'message:send',
} as const;

export const SERVER_EVENTS = {
  ROOM_STATE: 'room:state',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  PLAYER_UPDATED: 'player:updated',
  TURN_CHOOSING: 'turn:choosing',
  TURN_OPTIONS: 'turn:options',
  TURN_START: 'turn:start',
  TURN_WORD: 'turn:word',
  TURN_HINT: 'turn:hint',
  TURN_TIMER: 'turn:timer',
  TURN_END: 'turn:end',
  GAME_END: 'game:end',
  STROKE_START: 'stroke:start',
  STROKE_POINTS: 'stroke:points',
  STROKE_END: 'stroke:end',
  CANVAS_UNDO: 'canvas:undo',
  CANVAS_CLEAR: 'canvas:clear',
  MESSAGE_NEW: 'message:new',
  GUESS_CORRECT: 'guess:correct',
  GUESS_CLOSE: 'guess:close',
  SYSTEM_ERROR: 'system:error',
  SYSTEM_ONLINE: 'system:online',
} as const;

// --- Acuses (ack) de room:create y room:join ------------------------------

export type AckError = { ok: false; error: ErrorCode };
/** Acuse de `room:create` y `room:join`. Tras un éxito, el servidor además emite `room:state`. */
export type RoomAck = { ok: true; code: string; playerId: string } | AckError;

// --- Payloads servidor -> cliente -----------------------------------------

export type TurnChoosingPayload = {
  drawerId: string;
  endsAt: number;
  round: number;
  totalRounds: number;
};
export type TurnOptionsPayload = { words: string[] };
export type TurnStartPayload = {
  drawerId: string;
  mask: string;
  endsAt: number;
  round: number;
  totalRounds: number;
};
export type TurnWordPayload = { word: string };
export type TurnHintPayload = { mask: string };
export type TurnTimerPayload = { endsAt: number };
export type TurnEndPayload = TurnEnd;
export type GameEndPayload = { ranking: RankingEntry[] };
export type MessageNewPayload = { playerId: string; text: string; channel: MessageChannel };
export type GuessCorrectPayload = { playerId: string };
export type SystemErrorPayload = { code: ErrorCode };
export type SystemOnlinePayload = { count: number };

// --- Mapas de eventos para los genéricos de Socket.IO ---------------------

export interface ClientToServerEvents {
  'room:create': (payload: RoomCreatePayload, ack: (res: RoomAck) => void) => void;
  'room:join': (payload: RoomJoinPayload, ack: (res: RoomAck) => void) => void;
  'room:settings': (payload: RoomSettingsPayload) => void;
  'game:start': () => void;
  'word:choose': (payload: WordChoosePayload) => void;
  'stroke:start': (payload: StrokeStartPayload) => void;
  'stroke:points': (payload: StrokePointsPayload) => void;
  'stroke:end': (payload: StrokeEndPayload) => void;
  'canvas:undo': () => void;
  'canvas:clear': () => void;
  'message:send': (payload: MessageSendPayload) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'player:joined': (player: Player) => void;
  'player:left': (player: Player) => void;
  'player:updated': (player: Player) => void;
  'turn:choosing': (payload: TurnChoosingPayload) => void;
  'turn:options': (payload: TurnOptionsPayload) => void;
  'turn:start': (payload: TurnStartPayload) => void;
  'turn:word': (payload: TurnWordPayload) => void;
  'turn:hint': (payload: TurnHintPayload) => void;
  'turn:timer': (payload: TurnTimerPayload) => void;
  'turn:end': (payload: TurnEndPayload) => void;
  'game:end': (payload: GameEndPayload) => void;
  'stroke:start': (payload: StrokeStartPayload) => void;
  'stroke:points': (payload: StrokePointsPayload) => void;
  'stroke:end': (payload: StrokeEndPayload) => void;
  'canvas:undo': () => void;
  'canvas:clear': () => void;
  'message:new': (payload: MessageNewPayload) => void;
  'guess:correct': (payload: GuessCorrectPayload) => void;
  'guess:close': () => void;
  'system:error': (payload: SystemErrorPayload) => void;
  'system:online': (payload: SystemOnlinePayload) => void;
}

export type ClientEventName = keyof ClientToServerEvents;
export type ServerEventName = keyof ServerToClientEvents;
