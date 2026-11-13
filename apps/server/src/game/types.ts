// Tipos del motor de reglas (docs/motor-reglas.md sección 3).

import type {
  ErrorCode,
  GameSettings,
  Phase,
  RankingEntry,
  RoomState,
  ServerToClientEvents,
  TurnEnd,
} from '@dya/shared';

export type PlayerId = string;
export interface WordEntry {
  text: string;
  accept?: string[];
} // subconjunto del tipo de words/

export interface EngineConfig {
  minPlayers: number; // MIN_PLAYERS_TO_START
  maxPlayers: number; // MAX_PLAYERS
  optionsCount: number; // WORD_OPTIONS_COUNT
  chooseMs: number; // CHOOSE_SECONDS * 1000
  shortenToMs: number; // AFTER_FIRST_GUESS_SECONDS * 1000
  turnEndMs: number; // TURN_END_SECONDS * 1000
  graceMs: number; // RECONNECT_GRACE_SECONDS * 1000
  hintFractions: readonly number[]; // HINT_TIME_FRACTIONS
  drawMsOverride?: number; // solo pruebas e2e: reemplaza settings.drawSeconds * 1000
}

export interface EnginePlayer {
  id: PlayerId;
  sessionId: string; // secreto
  name: string;
  score: number;
  connected: boolean;
  connId: string | null; // socket actual
  disconnectedAt: number | null; // inicio de la gracia
}

export interface Guess {
  playerId: PlayerId;
  points: number;
} // en orden de acierto

export interface TurnState {
  drawerId: PlayerId;
  options: WordEntry[];
  word: WordEntry | null; // definida desde DRAWING
  answers: string[]; // normalizeGuess de text y de cada accept
  revealed: number[]; // índices revelados, según getMaskableIndices
  pendingHints: number[]; // instantes absolutos ascendentes, todos < deadline
  guesses: Guess[];
  result: TurnEnd | null; // se fija al entrar en TURN_END
}

export interface GameState {
  phase: Phase;
  config: EngineConfig;
  settings: GameSettings;
  players: EnginePlayer[]; // orden del arreglo = orden de llegada
  hostId: PlayerId | null;
  round: number; // 0 en LOBBY
  drawnThisRound: PlayerId[];
  usedWords: string[]; // textos de todas las opciones ofrecidas en la partida
  turn: TurnState | null; // solo en CHOOSING, DRAWING y TURN_END
  deadline: number | null; // fin de CHOOSING, DRAWING o TURN_END; null en LOBBY y GAME_END
  ranking: RankingEntry[] | null; // solo en GAME_END
}

export interface EngineContext {
  now: number;
  rng: () => number;
  pickWords: (used: readonly string[], n: number) => WordEntry[];
  newId: () => string;
}

export type Action =
  | { type: 'join'; sessionId: string; name: string; connId: string } // también reconexión y otra pestaña
  | { type: 'disconnect'; playerId: PlayerId; connId: string }
  | { type: 'leave'; playerId: PlayerId } // borrado inmediato
  | { type: 'updateSettings'; playerId: PlayerId; rounds: number; drawSeconds: number }
  | { type: 'start'; playerId: PlayerId }
  | { type: 'chooseWord'; playerId: PlayerId; index: number }
  | { type: 'message'; playerId: PlayerId; text: string }
  | { type: 'tick' };

export type Recipient =
  | { kind: 'room' }
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'roomExcept'; playerId: PlayerId }
  | { kind: 'players'; playerIds: PlayerId[] }; // canal "guessed", resuelto al reducir

export type EngineEvent =
  | 'player:joined'
  | 'player:left'
  | 'player:updated'
  | 'turn:choosing'
  | 'turn:options'
  | 'turn:start'
  | 'turn:word'
  | 'turn:hint'
  | 'turn:timer'
  | 'turn:end'
  | 'game:end'
  | 'message:new'
  | 'guess:correct'
  | 'guess:close';

export type EngineSnapshot = Omit<RoomState, 'code' | 'strokes'>; // la red agrega code y strokes

export type Effect =
  | {
      [E in EngineEvent]: {
        type: 'emit';
        to: Recipient;
        event: E;
        payload: Parameters<ServerToClientEvents[E]>[0];
      };
    }[EngineEvent]
  | { type: 'snapshot'; playerId: PlayerId; snapshot: EngineSnapshot } // la red envía room:state
  | { type: 'strokes:reset' } // la red vacía su historial
  | { type: 'disconnectConn'; connId: string }; // la red cierra el socket viejo

export interface ReduceResult {
  state: GameState;
  effects: Effect[]; // en orden causal
  error?: ErrorCode; // con error, el estado solo refleja advance() y no hay efectos de la acción
  playerId?: PlayerId; // en un join exitoso
}
