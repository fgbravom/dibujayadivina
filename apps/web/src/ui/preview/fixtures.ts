// Datos simulados para la vista previa. Respetan exactamente los tipos del contrato.

import {
  DEFAULT_DRAW_SECONDS,
  DEFAULT_ROUNDS,
  maskWord,
  type Phase,
  type Player,
  type RankingEntry,
  type RoomState,
  type TurnEnd,
} from '@dya/shared';
import { buildRanking } from '../lib/ranking';
import {
  closeFeedItem,
  guessedFeedItem,
  infoFeedItem,
  joinedFeedItem,
  messageToFeedItem,
} from '../lib/feed';
import type { FeedItem } from '../types';

export const SECRET_WORD = 'mote con huesillo';

const BASE_NAMES = ['Ana', 'Beto', 'Caro'];
const CROWD_NAMES = [
  'Ana',
  'Maximiliano',
  'Caro',
  'Dani',
  'Josefa Ignacia',
  'Fran',
  'Gabo',
  'Pancho',
  'Isi',
  'Javi',
  'Catalina F.',
  'Lalo',
];

export function makePlayers(names: readonly string[]): Player[] {
  return names.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    score: Math.max(0, (names.length - i) * 14 - (i % 3) * 5),
    connected: true,
    isHost: i === 0,
    guessed: false,
  }));
}

export type RoomOverrides = Partial<RoomState>;

/** Sala base de 3 jugadores en LOBBY. Quien mira es `p1` (anfitrión) salvo que se indique `selfId`. */
export function makeRoom(now: number, overrides: RoomOverrides = {}): RoomState {
  const players = overrides.players ?? makePlayers(BASE_NAMES);
  return {
    code: 'KQXM',
    phase: 'LOBBY',
    settings: { rounds: DEFAULT_ROUNDS, drawSeconds: DEFAULT_DRAW_SECONDS },
    players,
    hostId: 'p1',
    selfId: 'p1',
    drawerId: null,
    round: 0,
    totalRounds: DEFAULT_ROUNDS,
    mask: null,
    endsAt: null,
    serverNow: now,
    strokes: [],
    word: null,
    wordOptions: null,
    turnEnd: null,
    ranking: null,
    ...overrides,
  };
}

function withPlayers(
  players: Player[],
  patch: (p: Player, i: number) => Partial<Player>,
): Player[] {
  return players.map((p, i) => ({ ...p, ...patch(p, i) }));
}

export function makeLobbyRoom(
  now: number,
  opts: { selfId?: string; crowd?: boolean; solo?: boolean } = {},
) {
  const players = opts.solo
    ? makePlayers(['Ana'])
    : opts.crowd
      ? makePlayers(CROWD_NAMES)
      : makePlayers(BASE_NAMES);
  return makeRoom(now, { players, selfId: opts.selfId ?? 'p1' });
}

export type GameVariant = 'drawer' | 'guesser' | 'guessed';

/** Sala en juego. `p2` es el dibujante salvo que `drawerIsSelf`; quien mira es `p1` o `p2`. */
export function makeGameRoom(
  now: number,
  phase: Extract<Phase, 'CHOOSING' | 'DRAWING' | 'TURN_END'>,
  opts: {
    view: GameVariant;
    crowd?: boolean;
    secondsLeft?: number;
    turnEnd?: TurnEnd;
  },
): RoomState {
  const names = opts.crowd ? CROWD_NAMES : BASE_NAMES;
  const base = makePlayers(names);
  // Dibujante: p2 (o p1 si quien mira es el dibujante). Quien mira siempre es p1 salvo en "drawer".
  const drawerId = opts.view === 'drawer' ? 'p1' : 'p2';
  const players = withPlayers(base, (p, i) => ({
    guessed:
      phase === 'DRAWING' || phase === 'TURN_END'
        ? opts.view === 'guessed'
          ? i === 0 || i === 2
          : i === 2
        : false,
    connected: !(opts.crowd && (i === 5 || i === 9)),
  }));
  const defaultSeconds =
    opts.secondsLeft ??
    (phase === 'CHOOSING' ? 10 : phase === 'DRAWING' ? DEFAULT_DRAW_SECONDS - 12 : 4);
  const word = SECRET_WORD;
  const revealed = [0, 5];
  return makeRoom(now, {
    phase,
    players,
    selfId: 'p1',
    drawerId,
    hostId: 'p1',
    round: 2,
    totalRounds: 3,
    endsAt: now + defaultSeconds * 1000,
    mask: phase === 'CHOOSING' ? null : maskWord(word, revealed),
    word: phase === 'DRAWING' && opts.view === 'drawer' ? word : null,
    wordOptions:
      phase === 'CHOOSING' && opts.view === 'drawer' ? ['sopaipilla', 'volantín', 'copihue'] : null,
    turnEnd: phase === 'TURN_END' ? (opts.turnEnd ?? makeTurnEnd(players, drawerId)) : null,
  });
}

export function makeTurnEnd(players: readonly Player[], drawerId: string): TurnEnd {
  const gains: Record<string, number> = {};
  const scores: Record<string, number> = {};
  let order = 0;
  for (const p of players) {
    if (p.id === drawerId) continue;
    if (p.guessed) {
      gains[p.id] = [10, 8, 6, 4][Math.min(order, 3)] ?? 4;
      order += 1;
    } else {
      gains[p.id] = 0;
    }
  }
  gains[drawerId] = order === 0 ? 0 : 10 + (order - 1);
  for (const p of players) scores[p.id] = p.score + (gains[p.id] ?? 0);
  return {
    word: SECRET_WORD,
    gains,
    scores,
    reason: order >= players.length - 1 ? 'all_guessed' : 'time',
  };
}

export function makeRanking(opts: { tie?: boolean; crowd?: boolean } = {}): RankingEntry[] {
  const names = opts.crowd ? CROWD_NAMES : ['Ana', 'Beto', 'Caro', 'Dani', 'Eli'];
  const scores = opts.tie
    ? [120, 120, 90, 60, 60, 30, 10, 10, 0, 0, 0, 0]
    : [140, 110, 95, 60, 35, 20, 15, 10, 5, 5, 0, 0];
  return buildRanking(names.map((name, i) => ({ id: `p${i + 1}`, name, score: scores[i] ?? 0 })));
}

// --- Mensajes de ejemplo --------------------------------------------------

export function makeFeed(
  players: readonly Player[],
  selfId: string,
  kind: 'lobby' | 'drawing' | 'guessed',
): FeedItem[] {
  const msg = (n: number, playerId: string, text: string, channel: 'all' | 'guessed' = 'all') =>
    messageToFeedItem({ playerId, text, channel }, players, selfId, `m${n}`);
  const items: FeedItem[] = [
    joinedFeedItem(players[1]?.name ?? 'Beto', 'j1'),
    joinedFeedItem(players[2]?.name ?? 'Caro', 'j2'),
  ];
  if (kind === 'lobby') {
    items.push(msg(1, 'p2', 'Hola! quién parte?'), msg(2, 'p1', 'Esperen que lleguen los demás'));
    items.push(infoFeedItem('Recuerda: en cada ronda todos dibujan una vez.', 'i1'));
    return items;
  }
  items.push(
    msg(3, 'p3', 'una polera?'),
    msg(4, 'p1', 'algo de comer'),
    closeFeedItem('c1'),
    msg(5, 'p3', 'sopaipilla'),
    guessedFeedItem(players[2]?.name ?? 'Caro', false, 'g1'),
  );
  if (kind === 'guessed') {
    items.push(
      msg(6, 'p3', 'se me hace agua la boca', 'guessed'),
      msg(7, 'p2', 'jaja nada que ver', 'guessed'),
    );
  }
  return items;
}
