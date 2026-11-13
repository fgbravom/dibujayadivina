// API pública del motor de reglas (docs/motor-reglas.md).

export { DEFAULT_ENGINE_CONFIG } from './config.js';
export { canDraw, createGame, nextWakeAt, reduce } from './reducer.js';
export { buildSnapshot } from './snapshot.js';
export type {
  Action,
  Effect,
  EngineConfig,
  EngineContext,
  EngineEvent,
  EnginePlayer,
  EngineSnapshot,
  GameState,
  Guess,
  PlayerId,
  ReduceResult,
  Recipient,
  TurnState,
  WordEntry,
} from './types.js';
