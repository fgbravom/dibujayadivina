import { describe, expect, it } from 'vitest';
import type { PlayerId } from './types.js';
import { assertNoWordLeak, chooseWord, currentWord, emitsOf, startedGame } from './testing.js';
import type { Harness } from './testing.js';

interface TurnScript {
  drawer: PlayerId;
  /** Quiénes aciertan, en orden. */
  guessers: PlayerId[];
  gains: Record<PlayerId, number>;
  reason: 'time' | 'all_guessed';
}

// Ana (p1), Beto (p2) y Caro (p3), 3 rondas: cada una dibuja una vez por ronda.
const SCRIPT: TurnScript[] = [
  { drawer: 'p1', guessers: ['p2', 'p3'], gains: { p1: 11, p2: 10, p3: 8 }, reason: 'all_guessed' },
  { drawer: 'p2', guessers: ['p1', 'p3'], gains: { p1: 10, p2: 11, p3: 8 }, reason: 'all_guessed' },
  { drawer: 'p3', guessers: [], gains: { p1: 0, p2: 0, p3: 0 }, reason: 'time' },
  { drawer: 'p1', guessers: ['p3'], gains: { p1: 10, p2: 0, p3: 10 }, reason: 'time' },
  { drawer: 'p2', guessers: ['p1', 'p3'], gains: { p1: 10, p2: 11, p3: 8 }, reason: 'all_guessed' },
  { drawer: 'p3', guessers: ['p2'], gains: { p1: 0, p2: 10, p3: 10 }, reason: 'time' },
  { drawer: 'p1', guessers: ['p2', 'p3'], gains: { p1: 11, p2: 10, p3: 8 }, reason: 'all_guessed' },
  { drawer: 'p2', guessers: ['p3', 'p1'], gains: { p1: 8, p2: 11, p3: 10 }, reason: 'all_guessed' },
  { drawer: 'p3', guessers: ['p1'], gains: { p1: 10, p2: 0, p3: 10 }, reason: 'time' },
];

function playTurn(h: Harness, turn: TurnScript): void {
  expect(h.state.phase).toBe('CHOOSING');
  expect(h.state.turn?.drawerId).toBe(turn.drawer);
  chooseWord(h, 0);
  const text = currentWord(h);
  for (const id of turn.guessers) {
    h.advanceBy(1_000);
    h.say(id, text);
  }
  if (turn.reason === 'time') h.advanceTo(h.state.deadline!);
  expect(h.state.phase).toBe('TURN_END');
}

describe('partida integral', () => {
  it('3 jugadores y 3 rondas: fases, puntajes exactos y ranking', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro'], { settings: { rounds: 3 } });

    SCRIPT.forEach((turn, i) => {
      playTurn(h, turn);
      const end = emitsOf(h.effects, 'turn:end').at(-1);
      expect(end?.payload.gains, `ganancias del turno ${i + 1}`).toEqual(turn.gains);
      expect(end?.payload.reason, `motivo del turno ${i + 1}`).toBe(turn.reason);
      h.advanceTo(h.state.deadline!); // cierre de turno: sigue el próximo o termina la partida
    });

    expect(h.state.phase).toBe('GAME_END');
    expect(h.state.players.map((p) => [p.id, p.score])).toEqual([
      ['p1', 70],
      ['p2', 63],
      ['p3', 72],
    ]);
    const [gameEnd] = emitsOf(h.effects, 'game:end');
    expect(gameEnd?.payload.ranking).toEqual([
      { playerId: 'p3', name: 'Caro', score: 72, rank: 1 },
      { playerId: 'p1', name: 'Ana', score: 70, rank: 2 },
      { playerId: 'p2', name: 'Beto', score: 63, rank: 3 },
    ]);

    // Secuencia de fases, tomada de los eventos emitidos.
    const phases = h.effects.flatMap((e) => {
      if (e.type !== 'emit') return [];
      const byEvent: Record<string, string> = {
        'turn:choosing': 'CHOOSING',
        'turn:start': 'DRAWING',
        'turn:end': 'TURN_END',
        'game:end': 'GAME_END',
      };
      const phase = byEvent[e.event];
      return phase ? [phase] : [];
    });
    expect(phases).toEqual([
      ...Array.from({ length: 9 }, () => ['CHOOSING', 'DRAWING', 'TURN_END']).flat(),
      'GAME_END',
    ]);

    // Dibujantes y rondas.
    expect(
      emitsOf(h.effects, 'turn:start').map((e) => [e.payload.drawerId, e.payload.round]),
    ).toEqual(SCRIPT.map((t, i) => [t.drawer, Math.floor(i / 3) + 1]));

    // Las opciones no se repiten en toda la partida.
    expect(new Set(h.state.usedWords).size).toBe(27);

    // El sessionId nunca sale.
    expect(JSON.stringify(h.effects)).not.toContain('secret-');
  });

  it('la palabra no llega a ningún adivinador en una partida completa', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro'], { settings: { rounds: 3 } });
    for (const turn of SCRIPT) {
      playTurn(h, turn);
      h.advanceTo(h.state.deadline!);
    }
    expect(h.state.phase).toBe('GAME_END');

    // Un turno va desde su `turn:choosing` hasta su `turn:end` (donde la palabra se revela a todos).
    const turns: {
      word: string;
      drawer: PlayerId;
      guessers: PlayerId[];
      from: number;
      to: number;
    }[] = [];
    h.effects.forEach((e, i) => {
      if (e.type !== 'emit') return;
      if (e.event === 'turn:choosing') {
        turns.push({ word: '', drawer: e.payload.drawerId, guessers: [], from: i, to: -1 });
      }
      const current = turns[turns.length - 1];
      if (!current) return;
      if (e.event === 'guess:correct') current.guessers.push(e.payload.playerId);
      if (e.event === 'turn:end') {
        current.word = e.payload.word;
        current.to = i;
      }
    });

    expect(turns).toHaveLength(9);
    for (const t of turns) {
      expect(t.word).not.toBe('');
      const slice = h.effects.slice(t.from, t.to);
      expect(slice.length).toBeGreaterThan(0);
      assertNoWordLeak(slice, t.word, [t.drawer, ...t.guessers]);
    }

    // Y sí se revela al terminar cada turno: la comprobación no es vacua.
    const ends = emitsOf(h.effects, 'turn:end');
    expect(ends).toHaveLength(9);
    expect(() => assertNoWordLeak(ends, ends[0]!.payload.word, [])).toThrow(/Fuga/);
  });

  it('un intento que contiene la palabra solo vuelve a su autor, y el chat privado no sale', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro']);
    chooseWord(h, 0);
    const mark = h.effects.length;
    h.say('p2', 'huemol'); // casi: no es la palabra
    h.say('p3', 'creo que es el huemul'); // contiene la palabra: solo para su autor
    h.say('p1', 'huemul'); // dibujante: canal guessed
    // Conocen la palabra el dibujante y, por su propio eco, Caro, que la escribió.
    assertNoWordLeak(h.since(mark), 'huemul', ['p1', 'p3']);
  });
});
