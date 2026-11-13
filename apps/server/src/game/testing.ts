// Arnés de pruebas del motor (solo lo importan las pruebas): reloj, azar, ids y palabras controlables.

import { normalizeGuess } from '@dya/shared';
import type { GameSettings } from '@dya/shared';
import { createGame, nextWakeAt, reduce } from './reducer.js';
import type {
  Action,
  Effect,
  EngineConfig,
  EngineEvent,
  GameState,
  PlayerId,
  Recipient,
  ReduceResult,
  WordEntry,
} from './types.js';

export const START_TIME = 1_000_000;

const FILLER = [
  'volcan',
  'cerro',
  'playa',
  'lago',
  'rio',
  'puente',
  'torre',
  'casa',
  'perro',
  'gato',
  'sol',
  'luna',
  'arbol',
  'flor',
  'nube',
  'tren',
  'bus',
  'barco',
  'avion',
  'pan',
  'queso',
  'leche',
  'mesa',
  'silla',
  'libro',
  'lapiz',
  'reloj',
  'llave',
  'ropa',
  'zapato',
  'gorro',
  'puerta',
  'ventana',
  'pelota',
  'bicicleta',
];

/** Banco falso para las pruebas: sin repetir mientras queden palabras sin usar. */
export const FIXTURE_WORDS: WordEntry[] = [
  { text: 'huemul' },
  { text: 'sopaipilla' },
  { text: 'micro', accept: ['la micro'] },
  { text: 'mote con huesillo' },
  { text: 'te' },
  ...FILLER.map((text) => ({ text })),
];

export function word(text: string, accept?: string[]): WordEntry {
  return accept ? { text, accept } : { text };
}

export interface HarnessOptions {
  config?: Partial<EngineConfig>;
  settings?: Partial<GameSettings>;
  /** Opciones que devolverá `pickWords`, una lista por llamada; después usa el banco falso. */
  pickScript?: WordEntry[][];
}

export interface Harness {
  state: GameState;
  now: number;
  /** Todos los efectos emitidos desde que se creó el arnés. */
  effects: Effect[];
  last: ReduceResult;
  dispatch(action: Action): ReduceResult;
  /** Avanza el reloj despertando el motor en cada vencimiento, como la capa de red. */
  advanceTo(ms: number): void;
  advanceBy(ms: number): void;
  /** Entra con una sesión nueva (o la indicada) y devuelve el id del jugador. */
  join(name: string, opts?: { sessionId?: string; connId?: string }): PlayerId;
  /** Entra con varios nombres seguidos. */
  joinAll(...names: string[]): PlayerId[];
  disconnect(playerId: PlayerId): ReduceResult;
  /** Escribe un mensaje de texto. */
  say(playerId: PlayerId, text: string): ReduceResult;
  /** Efectos emitidos desde la marca (un valor de `effects.length`). */
  since(mark: number): Effect[];
  /** Id del jugador por orden de llegada (0 es el primero). */
  idAt(index: number): PlayerId;
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const script = [...(options.pickScript ?? [])];
  let idCounter = 0;
  let rngCounter = 0;
  const rngSequence = [0.1, 0.6, 0.35, 0.8, 0.2];
  let connCounter = 0;

  const h: Harness = {
    state: createGame(options.config, options.settings),
    now: START_TIME,
    effects: [],
    last: undefined as unknown as ReduceResult,
    dispatch(action) {
      const result = reduce(h.state, action, {
        now: h.now,
        rng: () => rngSequence[rngCounter++ % rngSequence.length] ?? 0,
        pickWords: (used, n) => {
          const scripted = script.shift();
          if (scripted) return scripted;
          const fresh = FIXTURE_WORDS.filter((w) => !used.includes(w.text));
          return [...fresh, ...FIXTURE_WORDS].slice(0, n);
        },
        newId: () => `p${++idCounter}`,
      });
      h.state = result.state;
      h.last = result;
      h.effects.push(...result.effects);
      return result;
    },
    advanceTo(ms) {
      for (
        let wake = nextWakeAt(h.state);
        wake !== null && wake <= ms;
        wake = nextWakeAt(h.state)
      ) {
        h.now = Math.max(h.now, wake);
        h.dispatch({ type: 'tick' });
      }
      h.now = Math.max(h.now, ms);
    },
    advanceBy(ms) {
      h.advanceTo(h.now + ms);
    },
    join(name, opts = {}) {
      const sessionId = opts.sessionId ?? `secret-${name}`;
      const result = h.dispatch({
        type: 'join',
        sessionId,
        name,
        connId: opts.connId ?? `socket-${++connCounter}`,
      });
      if (!result.playerId) throw new Error(`join falló: ${result.error}`);
      return result.playerId;
    },
    joinAll(...names) {
      return names.map((n) => h.join(n));
    },
    disconnect(playerId) {
      const player = h.state.players.find((p) => p.id === playerId);
      if (!player?.connId) throw new Error(`jugador ${playerId} sin conexión`);
      return h.dispatch({ type: 'disconnect', playerId, connId: player.connId });
    },
    say(playerId, text) {
      return h.dispatch({ type: 'message', playerId, text });
    },
    since(mark) {
      return h.effects.slice(mark);
    },
    idAt(index) {
      const p = h.state.players[index];
      if (!p) throw new Error(`no hay jugador en la posición ${index}`);
      return p.id;
    },
  };
  return h;
}

// --- Consulta de efectos ---------------------------------------------------

type Emit<E extends EngineEvent> = Extract<Effect, { type: 'emit'; event: E }>;

/** Efectos `emit` de un evento. */
export function emitsOf<E extends EngineEvent>(effects: readonly Effect[], event: E): Emit<E>[] {
  return effects.filter((e): e is Emit<E> => e.type === 'emit' && e.event === event);
}

export function snapshotsOf(effects: readonly Effect[]) {
  return effects.filter((e): e is Extract<Effect, { type: 'snapshot' }> => e.type === 'snapshot');
}

function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => stringsIn(v, out));
  return out;
}

function reachesOutside(to: Recipient, knowers: ReadonlySet<PlayerId>): boolean {
  switch (to.kind) {
    case 'room':
    case 'roomExcept':
      return true; // llega a cualquiera de la sala
    case 'player':
      return !knowers.has(to.playerId);
    case 'players':
      return to.playerIds.some((id) => !knowers.has(id));
  }
}

/**
 * Falla si algún efecto dirigido a alguien fuera de `knowers` contiene la palabra (comparada
 * con `normalizeGuess`). Un efecto a la sala o a "todos menos uno" cuenta como dirigido a todos.
 */
export function assertNoWordLeak(
  effects: readonly Effect[],
  wordText: string,
  knowers: Iterable<PlayerId>,
): void {
  const known = new Set(knowers);
  const needle = normalizeGuess(wordText);
  effects.forEach((effect, i) => {
    let recipient: Recipient;
    let payload: unknown;
    if (effect.type === 'emit') {
      recipient = effect.to;
      payload = effect.payload;
    } else if (effect.type === 'snapshot') {
      recipient = { kind: 'player', playerId: effect.playerId };
      payload = effect.snapshot;
    } else {
      return;
    }
    if (!reachesOutside(recipient, known)) return;
    const leaked = stringsIn(payload).some((s) => normalizeGuess(s).includes(needle));
    if (leaked) {
      throw new Error(
        `Fuga de la palabra "${wordText}" en el efecto #${i}: ${JSON.stringify(effect)}`,
      );
    }
  });
}

// --- Atajos de partida -------------------------------------------------------

/** Crea una sala con `names`, inicia la partida y deja el turno en CHOOSING. */
export function startedGame(names: string[], options: HarnessOptions = {}): Harness {
  const h = createHarness(options);
  h.joinAll(...names);
  const res = h.dispatch({ type: 'start', playerId: h.idAt(0) });
  if (res.error) throw new Error(`start falló: ${res.error}`);
  return h;
}

/** El dibujante elige la opción `index` y el turno pasa a DRAWING. */
export function chooseWord(h: Harness, index = 0): void {
  const drawerId = h.state.turn?.drawerId;
  if (!drawerId) throw new Error('no hay turno');
  const res = h.dispatch({ type: 'chooseWord', playerId: drawerId, index });
  if (res.error) throw new Error(`chooseWord falló: ${res.error}`);
}

/** Crea una sala con `names`, inicia la partida y deja el primer turno en DRAWING. */
export function drawingGame(names: string[], options: HarnessOptions = {}, wordIndex = 0): Harness {
  const h = startedGame(names, options);
  chooseWord(h, wordIndex);
  return h;
}

/** Texto de la palabra en juego. */
export function currentWord(h: Harness): string {
  const w = h.state.turn?.word?.text;
  if (!w) throw new Error('no hay palabra en juego');
  return w;
}
