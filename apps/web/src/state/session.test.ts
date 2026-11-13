import {
  TURN_END_SECONDS,
  type Player,
  type RankingEntry,
  type RoomState,
  type Stroke,
} from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { canvasCommandFor } from './canvasBridge';
import { initialSession, reduceSession, type ServerEvent, type SessionState } from './session';

const NOW = 1_000_000;
/** El servidor va 5 s por delante del reloj local. */
const SERVER_NOW = NOW + 5000;

const player = (id: string, over: Partial<Player> = {}): Player => ({
  id,
  name: `Jugador ${id}`,
  score: 0,
  connected: true,
  isHost: false,
  guessed: false,
  ...over,
});

const stroke: Stroke = { id: 's1', color: '#000000', size: 8, tool: 'brush', points: [1, 1, 2, 2] };

function lobbyRoom(over: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCD',
    phase: 'LOBBY',
    settings: { rounds: 3, drawSeconds: 80 },
    players: [player('a', { isHost: true }), player('b')],
    hostId: 'a',
    selfId: 'b',
    drawerId: null,
    round: 0,
    totalRounds: 3,
    mask: null,
    endsAt: null,
    serverNow: SERVER_NOW,
    strokes: [],
    word: null,
    wordOptions: null,
    turnEnd: null,
    ranking: null,
    ...over,
  };
}

function run(state: SessionState, ...events: ServerEvent[]): SessionState {
  return events.reduce((s, e) => reduceSession(s, e, NOW), state);
}

const withLobby = (over: Partial<RoomState> = {}): SessionState =>
  run(initialSession, { type: 'room:state', payload: lobbyRoom(over) });

function roomOf(state: SessionState): RoomState {
  if (!state.room) throw new Error('sin sala');
  return state.room;
}

describe('room:state', () => {
  it('reemplaza la foto y mide el desfase de reloj', () => {
    const s = withLobby();
    expect(s.room?.code).toBe('ABCD');
    expect(s.serverOffsetMs).toBe(5000);
  });

  it('conserva la lista de mensajes si es la misma sala (reconexión)', () => {
    let s = withLobby();
    s = run(s, { type: 'message:new', payload: { playerId: 'a', text: 'hola', channel: 'all' } });
    s = run(s, { type: 'room:state', payload: lobbyRoom({ serverNow: SERVER_NOW + 1000 }) });
    expect(s.feed).toHaveLength(1);
    expect(s.serverOffsetMs).toBe(6000);
  });

  it('vacía la lista de mensajes al cambiar de sala', () => {
    let s = withLobby();
    s = run(s, { type: 'message:new', payload: { playerId: 'a', text: 'hola', channel: 'all' } });
    s = run(s, { type: 'room:state', payload: lobbyRoom({ code: 'WXYZ' }) });
    expect(s.feed).toEqual([]);
  });

  it('no deja pasar eventos incrementales sin una sala previa', () => {
    const s = run(initialSession, { type: 'turn:hint', payload: { mask: '_ _' } });
    expect(s).toBe(initialSession);
  });
});

describe('jugadores', () => {
  it('player:joined agrega al jugador y avisa en la lista', () => {
    const s = run(withLobby(), { type: 'player:joined', payload: player('c') });
    expect(roomOf(s).players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(s.feed.at(-1)).toMatchObject({
      kind: 'system',
      tone: 'join',
      text: 'Jugador c entró a la sala',
    });
  });

  it('player:joined de alguien ya conocido lo reemplaza sin repetir el aviso', () => {
    const s = run(withLobby(), { type: 'player:joined', payload: player('b', { name: 'Otro' }) });
    expect(roomOf(s).players).toHaveLength(2);
    expect(roomOf(s).players[1]?.name).toBe('Otro');
    expect(s.feed).toEqual([]);
  });

  it('player:left quita al jugador y avisa', () => {
    const s = run(withLobby(), { type: 'player:left', payload: player('b') });
    expect(roomOf(s).players.map((p) => p.id)).toEqual(['a']);
    expect(s.feed.at(-1)).toMatchObject({ tone: 'leave', text: 'Jugador b salió de la sala' });
  });

  it('el anfitrión se traspasa con player:left + player:updated', () => {
    let s = withLobby({ selfId: 'b' });
    s = run(s, { type: 'player:left', payload: player('a', { isHost: true }) });
    expect(roomOf(s).hostId).toBe('');
    s = run(s, { type: 'player:updated', payload: player('b', { isHost: true }) });
    expect(roomOf(s).hostId).toBe('b');
  });

  it('player:updated cambia datos como la conexión o el puntaje', () => {
    const s = run(withLobby(), {
      type: 'player:updated',
      payload: player('b', { connected: false, score: 7 }),
    });
    expect(roomOf(s).players[1]).toMatchObject({ connected: false, score: 7 });
  });
});

describe('eventos del turno', () => {
  const choosing = (): SessionState =>
    run(withLobby({ players: [player('a', { isHost: true, guessed: true }), player('b')] }), {
      type: 'turn:choosing',
      payload: { drawerId: 'a', endsAt: SERVER_NOW + 10_000 },
    });

  it('turn:choosing fija al dibujante y limpia palabra, máscara, aciertos y trazos', () => {
    const s = run(
      withLobby({
        phase: 'TURN_END',
        round: 2,
        mask: '_ _',
        word: 'sol',
        strokes: [stroke],
        players: [player('a', { guessed: true }), player('b')],
      }),
      { type: 'turn:choosing', payload: { drawerId: 'b', endsAt: 123 } },
    );
    const room = roomOf(s);
    expect(room).toMatchObject({
      phase: 'CHOOSING',
      drawerId: 'b',
      endsAt: 123,
      mask: null,
      word: null,
      wordOptions: null,
      turnEnd: null,
      strokes: [],
      round: 2,
    });
    expect(room.players.every((p) => !p.guessed)).toBe(true);
  });

  it('turn:choosing al partir la partida pone la ronda en 1', () => {
    expect(roomOf(choosing()).round).toBe(1);
  });

  it('turn:options guarda las opciones', () => {
    const s = run(choosing(), { type: 'turn:options', payload: { words: ['sol', 'luna', 'mar'] } });
    expect(roomOf(s).wordOptions).toEqual(['sol', 'luna', 'mar']);
  });

  it('turn:start pasa a DRAWING con máscara, fin y ronda, y descarta las opciones', () => {
    let s = run(choosing(), { type: 'turn:options', payload: { words: ['sol', 'luna', 'mar'] } });
    s = run(s, {
      type: 'turn:start',
      payload: {
        drawerId: 'a',
        mask: '_ _ _',
        endsAt: SERVER_NOW + 80_000,
        round: 2,
        totalRounds: 4,
      },
    });
    expect(roomOf(s)).toMatchObject({
      phase: 'DRAWING',
      drawerId: 'a',
      mask: '_ _ _',
      endsAt: SERVER_NOW + 80_000,
      round: 2,
      totalRounds: 4,
      wordOptions: null,
    });
  });

  it('turn:word guarda la palabra y turn:hint cambia la máscara', () => {
    let s = run(choosing(), {
      type: 'turn:start',
      payload: { drawerId: 'a', mask: '_ _ _', endsAt: 1, round: 1, totalRounds: 3 },
    });
    s = run(s, { type: 'turn:word', payload: { word: 'sol' } });
    s = run(s, { type: 'turn:hint', payload: { mask: 's _ _' } });
    expect(roomOf(s)).toMatchObject({ word: 'sol', mask: 's _ _' });
  });

  it('turn:timer acorta el fin del turno', () => {
    const s = run(choosing(), { type: 'turn:timer', payload: { endsAt: 777 } });
    expect(roomOf(s).endsAt).toBe(777);
  });

  it('guess:correct marca al jugador y agrega "adivinó"; a uno mismo le dice "¡Adivinaste!"', () => {
    let s = run(choosing(), { type: 'guess:correct', payload: { playerId: 'a' } });
    expect(roomOf(s).players.find((p) => p.id === 'a')?.guessed).toBe(true);
    expect(s.feed.at(-1)).toMatchObject({ tone: 'guessed', text: 'Jugador a adivinó' });
    s = run(s, { type: 'guess:correct', payload: { playerId: 'b' } });
    expect(s.feed.at(-1)).toMatchObject({ tone: 'guessed', text: '¡Adivinaste!' });
  });

  it('guess:close agrega el aviso "¡casi!"', () => {
    const s = run(choosing(), { type: 'guess:close', payload: undefined });
    expect(s.feed.at(-1)).toMatchObject({ tone: 'close' });
  });

  it('message:new agrega el mensaje con el nombre resuelto y marca los propios', () => {
    let s = run(withLobby(), {
      type: 'message:new',
      payload: { playerId: 'a', text: 'hola', channel: 'all' },
    });
    s = run(s, { type: 'message:new', payload: { playerId: 'b', text: 'ey', channel: 'guessed' } });
    expect(s.feed[0]).toMatchObject({
      name: 'Jugador a',
      text: 'hola',
      channel: 'all',
      isSelf: false,
    });
    expect(s.feed[1]).toMatchObject({ text: 'ey', channel: 'guessed', isSelf: true });
    expect(new Set(s.feed.map((f) => f.id)).size).toBe(2);
  });

  it('turn:end pasa a TURN_END, actualiza puntajes y calcula el fin de la pausa con el reloj del servidor', () => {
    const s = run(withLobby({ phase: 'DRAWING', drawerId: 'a', endsAt: 5 }), {
      type: 'turn:end',
      payload: {
        word: 'sol',
        gains: { a: 10, b: 10 },
        scores: { a: 10, b: 10, fantasma: 99 },
        reason: 'all_guessed',
      },
    });
    const room = roomOf(s);
    expect(room.phase).toBe('TURN_END');
    expect(room.turnEnd?.word).toBe('sol');
    expect(room.players.map((p) => p.score)).toEqual([10, 10]);
    expect(room.endsAt).toBe(NOW + 5000 + TURN_END_SECONDS * 1000);
  });

  it('game:end pasa a GAME_END con el ranking y sin reloj', () => {
    const ranking: RankingEntry[] = [{ playerId: 'a', name: 'Jugador a', score: 20, rank: 1 }];
    const s = run(withLobby({ phase: 'TURN_END', endsAt: 5 }), {
      type: 'game:end',
      payload: { ranking },
    });
    expect(roomOf(s)).toMatchObject({ phase: 'GAME_END', ranking, endsAt: null });
  });

  it('los eventos de trazo no cambian el estado (los aplica el lienzo)', () => {
    const base = withLobby();
    expect(run(base, { type: 'stroke:start', payload: stroke })).toBe(base);
    expect(run(base, { type: 'stroke:points', payload: { id: 's1', points: [3, 3] } })).toBe(base);
    expect(run(base, { type: 'stroke:end', payload: { id: 's1' } })).toBe(base);
    expect(run(base, { type: 'canvas:undo', payload: undefined })).toBe(base);
    expect(run(base, { type: 'canvas:clear', payload: undefined })).toBe(base);
  });

  it('no modifica el estado anterior', () => {
    const before = withLobby();
    const snapshot = JSON.stringify(before);
    run(
      before,
      { type: 'player:joined', payload: player('c') },
      { type: 'turn:choosing', payload: { drawerId: 'a', endsAt: 1 } },
      { type: 'guess:correct', payload: { playerId: 'a' } },
    );
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('un turno completo', () => {
  it('LOBBY -> CHOOSING -> DRAWING -> TURN_END -> CHOOSING -> TURN_END -> GAME_END -> LOBBY', () => {
    let s = withLobby({ selfId: 'b' });
    const phases: string[] = [roomOf(s).phase];
    const step = (...events: ServerEvent[]) => {
      s = run(s, ...events);
      phases.push(roomOf(s).phase);
    };

    // El anfitrión inicia: los puntajes en 0 llegan como player:updated y arranca el primer turno.
    step(
      { type: 'player:updated', payload: player('a', { isHost: true }) },
      { type: 'turn:choosing', payload: { drawerId: 'a', endsAt: SERVER_NOW + 10_000 } },
    );
    expect(roomOf(s).round).toBe(1);

    step({
      type: 'turn:start',
      payload: {
        drawerId: 'a',
        mask: '_ _ _',
        endsAt: SERVER_NOW + 80_000,
        round: 1,
        totalRounds: 3,
      },
    });
    s = run(s, { type: 'player:joined', payload: player('c') });
    s = run(s, { type: 'message:new', payload: { playerId: 'c', text: 'luna', channel: 'all' } });
    s = run(s, { type: 'guess:close', payload: undefined });
    s = run(s, { type: 'guess:correct', payload: { playerId: 'b' } });
    s = run(s, { type: 'turn:word', payload: { word: 'sol' } });
    s = run(s, { type: 'turn:timer', payload: { endsAt: SERVER_NOW + 20_000 } });
    s = run(s, { type: 'turn:hint', payload: { mask: 's _ _' } });
    expect(roomOf(s)).toMatchObject({ mask: 's _ _', word: 'sol', endsAt: SERVER_NOW + 20_000 });
    expect(roomOf(s).players.find((p) => p.id === 'b')?.guessed).toBe(true);

    step({
      type: 'turn:end',
      payload: {
        word: 'sol',
        gains: { a: 10, b: 10, c: 0 },
        scores: { a: 10, b: 10, c: 0 },
        reason: 'time',
      },
    });
    expect(roomOf(s).turnEnd?.reason).toBe('time');

    // Siguiente turno: nadie ha adivinado, sin palabra ni máscara, pero el puntaje se conserva.
    step({ type: 'turn:choosing', payload: { drawerId: 'b', endsAt: SERVER_NOW + 30_000 } });
    expect(roomOf(s)).toMatchObject({ drawerId: 'b', mask: null, word: null, turnEnd: null });
    expect(roomOf(s).players.map((p) => [p.score, p.guessed])).toEqual([
      [10, false],
      [10, false],
      [0, false],
    ]);

    step({
      type: 'turn:end',
      payload: {
        word: 'luna',
        gains: { a: 0, b: 0, c: 0 },
        scores: { a: 10, b: 10, c: 0 },
        reason: 'drawer_left',
      },
    });
    step({
      type: 'game:end',
      payload: {
        ranking: [
          { playerId: 'a', name: 'Jugador a', score: 10, rank: 1 },
          { playerId: 'b', name: 'Jugador b', score: 10, rank: 1 },
          { playerId: 'c', name: 'Jugador c', score: 0, rank: 3 },
        ],
      },
    });
    expect(roomOf(s).ranking).toHaveLength(3);

    // "Jugar de nuevo" lleva a la sala de espera con una foto completa.
    step({
      type: 'room:state',
      payload: lobbyRoom({ selfId: 'b', serverNow: SERVER_NOW + 99_000 }),
    });

    expect(phases).toEqual([
      'LOBBY',
      'CHOOSING',
      'DRAWING',
      'TURN_END',
      'CHOOSING',
      'TURN_END',
      'GAME_END',
      'LOBBY',
    ]);
    // Siguió en la misma sala: los mensajes de antes siguen ahí.
    expect(s.feed.length).toBeGreaterThan(0);
  });
});

describe('canvasCommandFor', () => {
  it('room:state carga el historial en partida', () => {
    const cmd = canvasCommandFor({
      type: 'room:state',
      payload: lobbyRoom({ phase: 'DRAWING', strokes: [stroke] }),
    });
    expect(cmd).toEqual({ type: 'load', strokes: [stroke] });
  });

  it('room:state de sala de espera o fin de partida vacía el lienzo', () => {
    for (const phase of ['LOBBY', 'GAME_END'] as const) {
      const cmd = canvasCommandFor({
        type: 'room:state',
        payload: lobbyRoom({ phase, strokes: [stroke] }),
      });
      expect(cmd).toEqual({ type: 'load', strokes: [] });
    }
  });

  it('turn:choosing vacía el lienzo y los eventos de trazo pasan al lienzo', () => {
    expect(
      canvasCommandFor({ type: 'turn:choosing', payload: { drawerId: 'a', endsAt: 1 } }),
    ).toEqual({
      type: 'clear',
    });
    expect(canvasCommandFor({ type: 'stroke:start', payload: stroke })).toEqual({
      type: 'strokeStart',
      payload: stroke,
    });
    expect(canvasCommandFor({ type: 'canvas:undo', payload: undefined })).toEqual({ type: 'undo' });
    expect(canvasCommandFor({ type: 'canvas:clear', payload: undefined })).toEqual({
      type: 'clear',
    });
  });

  it('los demás eventos no le importan al lienzo', () => {
    expect(canvasCommandFor({ type: 'turn:hint', payload: { mask: '_' } })).toBeNull();
    expect(canvasCommandFor({ type: 'guess:close', payload: undefined })).toBeNull();
  });
});
