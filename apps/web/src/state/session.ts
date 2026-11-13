// Reductor puro del estado de la sala en el cliente. Sin sockets, sin DOM, sin reloj propio:
// recibe cada evento del servidor y la hora local (`now`) y devuelve el estado siguiente.
//
// El servidor manda la foto completa (`room:state`) solo al entrar, reconectar, cambiar ajustes y
// volver a la sala de espera. Todo lo demás son eventos incrementales que se aplican aquí.
// Los trazos NO viven en este estado (llegan a ritmo de decenas por segundo y no deben re-renderizar
// la interfaz): van directo al lienzo por `canvasBridge`.

import {
  TURN_END_SECONDS,
  type Player,
  type RoomState,
  type ServerEventName,
  type ServerToClientEvents,
} from '@dya/shared';
import { computeServerOffset } from '../ui/lib/clock';
import {
  closeFeedItem,
  guessedFeedItem,
  joinedFeedItem,
  leftFeedItem,
  messageToFeedItem,
  trimFeed,
} from '../ui/lib/feed';
import type { FeedItem } from '../ui/types';

type PayloadOf<K extends ServerEventName> =
  Parameters<ServerToClientEvents[K]> extends [infer P, ...unknown[]] ? P : undefined;

/** Un evento del servidor con su nombre y datos, listo para el reductor. */
export type ServerEvent = {
  [K in ServerEventName]: { type: K; payload: PayloadOf<K> };
}[ServerEventName];

export type SessionState = {
  /** Foto local de la sala; `null` mientras no se está dentro de ninguna. */
  room: RoomState | null;
  /** Mensajes y avisos de la sala actual (se vacía al cambiar de sala). */
  feed: FeedItem[];
  /** Contador para generar ids estables de la lista de mensajes. */
  feedSeq: number;
  /** `serverNow - Date.now()` medido al recibir el último `room:state`. */
  serverOffsetMs: number;
};

export const initialSession: SessionState = {
  room: null,
  feed: [],
  feedSeq: 0,
  serverOffsetMs: 0,
};

/** Agrega un ítem a la lista de mensajes con un id nuevo. */
function withFeed(state: SessionState, make: (id: string) => FeedItem): SessionState {
  const id = `f${state.feedSeq}`;
  return {
    ...state,
    feedSeq: state.feedSeq + 1,
    feed: trimFeed([...state.feed, make(id)]),
  };
}

/** El anfitrión es quien trae `isHost`; si nadie lo trae (transición), se conserva el anterior si sigue en la sala. */
function resolveHostId(players: readonly Player[], previous: string): string {
  const host = players.find((p) => p.isHost);
  if (host) return host.id;
  return players.some((p) => p.id === previous) ? previous : '';
}

function upsertPlayer(room: RoomState, player: Player): RoomState {
  const exists = room.players.some((p) => p.id === player.id);
  const players = exists
    ? room.players.map((p) => (p.id === player.id ? player : p))
    : [...room.players, player];
  return { ...room, players, hostId: resolveHostId(players, room.hostId) };
}

function mapPlayers(room: RoomState, change: (p: Player) => Player): RoomState {
  return { ...room, players: room.players.map(change) };
}

export function reduceSession(
  state: SessionState,
  event: ServerEvent,
  /** Hora local en ms (`Date.now()`). */
  now: number,
): SessionState {
  if (event.type === 'room:state') {
    const incoming = event.payload;
    const sameRoom = state.room !== null && state.room.code === incoming.code;
    return {
      room: incoming,
      feed: sameRoom ? state.feed : [],
      feedSeq: sameRoom ? state.feedSeq : 0,
      serverOffsetMs: computeServerOffset(incoming.serverNow, now),
    };
  }

  const room = state.room;
  // Sin foto previa no hay nada que actualizar: un evento suelto no puede inventar una sala.
  if (!room) return state;

  switch (event.type) {
    case 'player:joined': {
      const known = room.players.some((p) => p.id === event.payload.id);
      const next = { ...state, room: upsertPlayer(room, event.payload) };
      return known ? next : withFeed(next, (id) => joinedFeedItem(event.payload.name, id));
    }

    case 'player:left': {
      const players = room.players.filter((p) => p.id !== event.payload.id);
      const next = {
        ...state,
        room: { ...room, players, hostId: resolveHostId(players, room.hostId) },
      };
      return withFeed(next, (id) => leftFeedItem(event.payload.name, id));
    }

    case 'player:updated':
      return { ...state, room: upsertPlayer(room, event.payload) };

    case 'turn:choosing': {
      return {
        ...state,
        room: {
          ...mapPlayers(room, (p) => (p.guessed ? { ...p, guessed: false } : p)),
          phase: 'CHOOSING',
          drawerId: event.payload.drawerId,
          endsAt: event.payload.endsAt,
          // La ronda llega ya al elegir palabra: sin esto la cabecera mostraría la anterior.
          round: event.payload.round,
          totalRounds: event.payload.totalRounds,
          mask: null,
          word: null,
          wordOptions: null,
          turnEnd: null,
          strokes: [],
        },
      };
    }

    case 'turn:options':
      return { ...state, room: { ...room, wordOptions: event.payload.words } };

    case 'turn:start':
      return {
        ...state,
        room: {
          ...room,
          phase: 'DRAWING',
          drawerId: event.payload.drawerId,
          mask: event.payload.mask,
          endsAt: event.payload.endsAt,
          round: event.payload.round,
          totalRounds: event.payload.totalRounds,
          wordOptions: null,
          turnEnd: null,
        },
      };

    case 'turn:word':
      return { ...state, room: { ...room, word: event.payload.word } };

    case 'turn:hint':
      return { ...state, room: { ...room, mask: event.payload.mask } };

    case 'turn:timer':
      return { ...state, room: { ...room, endsAt: event.payload.endsAt } };

    case 'guess:correct': {
      const { playerId } = event.payload;
      const guesser = room.players.find((p) => p.id === playerId);
      const next = {
        ...state,
        room: mapPlayers(room, (p) => (p.id === playerId ? { ...p, guessed: true } : p)),
      };
      return withFeed(next, (id) =>
        guessedFeedItem(guesser?.name ?? 'Alguien', playerId === room.selfId, id),
      );
    }

    case 'turn:end': {
      const { scores } = event.payload;
      return {
        ...state,
        room: {
          ...mapPlayers(room, (p) => {
            const score = scores[p.id];
            return score === undefined ? p : { ...p, score };
          }),
          phase: 'TURN_END',
          turnEnd: event.payload,
          // El servidor no manda el fin de la pausa: se calcula con su reloj estimado.
          endsAt: now + state.serverOffsetMs + TURN_END_SECONDS * 1000,
        },
      };
    }

    case 'game:end':
      return {
        ...state,
        room: { ...room, phase: 'GAME_END', ranking: event.payload.ranking, endsAt: null },
      };

    case 'message:new':
      return withFeed(state, (id) =>
        messageToFeedItem(event.payload, room.players, room.selfId, id),
      );

    case 'guess:close':
      return withFeed(state, (id) => closeFeedItem(id));

    // Trazos y lienzo los aplica `canvasBridge`; `system:error` lo maneja el cliente.
    // Ninguno forma parte de la foto de la sala.
    case 'stroke:start':
    case 'stroke:points':
    case 'stroke:end':
    case 'canvas:undo':
    case 'canvas:clear':
    case 'system:error':
      return state;
  }
}
