import type { Player, RoomState } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../state/session';
import { nextTick, soundForEvent, TICK_SECONDS, type TickState } from './triggers';

const player = (id: string, over: Partial<Player> = {}): Player => ({
  id,
  name: `Jugador ${id}`,
  score: 0,
  connected: true,
  isHost: false,
  guessed: false,
  ...over,
});

/** Yo soy "me"; dibuja "dib". */
function room(over: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCD',
    phase: 'DRAWING',
    settings: { rounds: 3, drawSeconds: 80 },
    players: [player('dib', { isHost: true }), player('me'), player('otro')],
    hostId: 'dib',
    selfId: 'me',
    drawerId: 'dib',
    round: 1,
    totalRounds: 3,
    mask: '_ _ _',
    endsAt: 1000,
    serverNow: 0,
    strokes: [],
    word: null,
    wordOptions: null,
    turnEnd: null,
    ranking: null,
    ...over,
  };
}

const turnEnd = (): ServerEvent => ({
  type: 'turn:end',
  payload: { word: 'huemul', gains: {}, scores: {}, reason: 'time' },
});

describe('soundForEvent: aciertos y cercanía', () => {
  it('alguien más adivinó', () => {
    const event: ServerEvent = { type: 'guess:correct', payload: { playerId: 'otro' } };
    expect(soundForEvent(room(), event)).toBe('guessOther');
  });

  it('adivinaste tú', () => {
    const event: ServerEvent = { type: 'guess:correct', payload: { playerId: 'me' } };
    expect(soundForEvent(room(), event)).toBe('guessSelf');
  });

  it('"¡casi!"', () => {
    expect(soundForEvent(room(), { type: 'guess:close', payload: undefined })).toBe('close');
  });
});

describe('soundForEvent: turnos', () => {
  const choosing = (drawerId: string): ServerEvent => ({
    type: 'turn:choosing',
    payload: { drawerId, endsAt: 1, round: 1, totalRounds: 3 },
  });

  it('te toca dibujar solo si eres el dibujante', () => {
    expect(soundForEvent(room({ phase: 'LOBBY' }), choosing('me'))).toBe('yourTurn');
    expect(soundForEvent(room({ phase: 'LOBBY' }), choosing('otro'))).toBeNull();
  });

  it('empieza el turno de dibujo', () => {
    const event: ServerEvent = {
      type: 'turn:start',
      payload: { drawerId: 'dib', mask: '_ _', endsAt: 1, round: 1, totalRounds: 3 },
    };
    expect(soundForEvent(room({ phase: 'CHOOSING' }), event)).toBe('turnStart');
  });

  it('fin de turno con aciertos', () => {
    const r = room({ players: [player('dib'), player('me', { guessed: true }), player('otro')] });
    expect(soundForEvent(r, turnEnd())).toBe('turnEnd');
  });

  it('fin de turno sin aciertos: variante apagada', () => {
    expect(soundForEvent(room(), turnEnd())).toBe('turnEndEmpty');
  });

  it('el dibujante no cuenta como acierto', () => {
    const r = room({ players: [player('dib', { guessed: true }), player('me')] });
    expect(soundForEvent(r, turnEnd())).toBe('turnEndEmpty');
  });

  it('fin de partida', () => {
    const event: ServerEvent = { type: 'game:end', payload: { ranking: [] } };
    expect(soundForEvent(room(), event)).toBe('gameEnd');
  });
});

describe('soundForEvent: jugadores', () => {
  it('entra alguien nuevo', () => {
    const event: ServerEvent = { type: 'player:joined', payload: player('nuevo') };
    expect(soundForEvent(room(), event)).toBe('playerJoin');
  });

  it('no suena por uno mismo ni por quien ya estaba (reconexión)', () => {
    const self: ServerEvent = { type: 'player:joined', payload: player('me') };
    const again: ServerEvent = { type: 'player:joined', payload: player('otro') };
    expect(soundForEvent(room(), self)).toBeNull();
    expect(soundForEvent(room(), again)).toBeNull();
  });

  it('sale alguien', () => {
    const event: ServerEvent = { type: 'player:left', payload: player('otro') };
    expect(soundForEvent(room(), event)).toBe('playerLeave');
  });

  it('no suena si sale uno mismo o alguien que no estaba', () => {
    expect(soundForEvent(room(), { type: 'player:left', payload: player('me') })).toBeNull();
    expect(soundForEvent(room(), { type: 'player:left', payload: player('x') })).toBeNull();
  });
});

describe('soundForEvent: chat', () => {
  it('mensaje de otra persona', () => {
    const event: ServerEvent = {
      type: 'message:new',
      payload: { playerId: 'otro', text: 'hola', channel: 'all' },
    };
    expect(soundForEvent(room(), event)).toBe('chat');
  });

  it('mensaje propio no suena', () => {
    const event: ServerEvent = {
      type: 'message:new',
      payload: { playerId: 'me', text: 'hola', channel: 'all' },
    };
    expect(soundForEvent(room(), event)).toBeNull();
  });
});

describe('soundForEvent: lo que nunca suena', () => {
  it('room:state (entrar o reconectar) no suena, ni siquiera a mitad de turno', () => {
    const event: ServerEvent = { type: 'room:state', payload: room() };
    expect(soundForEvent(null, event)).toBeNull();
    expect(soundForEvent(room(), event)).toBeNull();
  });

  it('sin sala previa no suena nada', () => {
    const event: ServerEvent = { type: 'guess:correct', payload: { playerId: 'otro' } };
    expect(soundForEvent(null, event)).toBeNull();
  });

  it('eventos sin sonido', () => {
    const silent: ServerEvent[] = [
      { type: 'player:updated', payload: player('otro') },
      { type: 'turn:options', payload: { words: ['a', 'b', 'c'] } },
      { type: 'turn:word', payload: { word: 'huemul' } },
      { type: 'turn:hint', payload: { mask: 'h _ _' } },
      { type: 'turn:timer', payload: { endsAt: 1 } },
      { type: 'canvas:undo', payload: undefined },
      { type: 'canvas:clear', payload: undefined },
      { type: 'system:error', payload: { code: 'internal' } },
    ];
    for (const event of silent) expect(soundForEvent(room(), event)).toBeNull();
  });
});

describe('nextTick', () => {
  const start: TickState = { last: null };

  /** Recorre los segundos dados y devuelve en cuáles sonó. */
  function played(seconds: (number | null)[], phase: RoomState['phase'] = 'DRAWING'): number[] {
    let state = start;
    const out: number[] = [];
    for (const s of seconds) {
      const step = nextTick(phase, s, state);
      state = step.state;
      if (step.play && s !== null) out.push(s);
    }
    return out;
  }

  it('suena una vez en cada uno de los últimos 10 segundos', () => {
    const polls: number[] = [];
    for (let s = 12; s >= 0; s--) polls.push(s, s, s); // varias consultas por segundo
    expect(played(polls)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(TICK_SECONDS).toBe(10);
  });

  it('no suena fuera de DRAWING', () => {
    expect(played([10, 9, 8], 'CHOOSING')).toEqual([]);
    expect(played([10, 9, 8], 'TURN_END')).toEqual([]);
    expect(played([10, 9, 8], 'LOBBY')).toEqual([]);
  });

  it('no suena sin reloj, en 0 ni por encima de 10', () => {
    expect(played([null, 0, 11, 30])).toEqual([]);
  });

  it('si el reloj se acorta (primer acierto) sigue contando sin repetir', () => {
    expect(played([30, 29, 9, 9, 8])).toEqual([9, 8]);
  });

  it('un turno nuevo vuelve a sonar desde 10', () => {
    expect(played([3, 2, 1, 0, 40, 10, 9])).toEqual([3, 2, 1, 10, 9]);
  });
});
