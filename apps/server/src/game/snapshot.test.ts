import { describe, expect, it } from 'vitest';
import { canDraw } from './reducer.js';
import { buildSnapshot } from './snapshot.js';
import {
  assertNoWordLeak,
  chooseWord,
  createHarness,
  drawingGame,
  emitsOf,
  snapshotsOf,
  startedGame,
} from './testing.js';

describe('snapshot', () => {
  it('el adivinador no ve la palabra ni las opciones en ninguna fase', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro']);
    const choosing = buildSnapshot(h.state, 'p2', h.now);
    expect(choosing.word).toBeNull();
    expect(choosing.wordOptions).toBeNull();
    expect(choosing.mask).toBeNull();
    expect(JSON.stringify(choosing)).not.toContain('huemul');

    chooseWord(h);
    h.advanceBy(45_000);
    const drawing = buildSnapshot(h.state, 'p2', h.now);
    expect(drawing.word).toBeNull();
    expect(drawing.wordOptions).toBeNull();
    expect(drawing.phase).toBe('DRAWING');
    expect(drawing.drawerId).toBe('p1');
    expect(drawing.mask).toMatch(/^[_ a-z]+$/);
    expect(drawing.mask?.replace(/[ _]/g, '')).toHaveLength(1); // una pista, ya revelada
    expect(JSON.stringify({ ...drawing, mask: null })).not.toContain('huemul');
  });

  it('el dibujante ve las opciones en CHOOSING y la palabra en DRAWING', () => {
    const h = startedGame(['Ana', 'Beto']);
    const choosing = buildSnapshot(h.state, 'p1', h.now);
    expect(choosing.wordOptions).toEqual(['huemul', 'sopaipilla', 'micro']);
    expect(choosing.word).toBeNull();
    expect(choosing.endsAt).toBe(h.now + 10_000);

    chooseWord(h, 1);
    const drawing = buildSnapshot(h.state, 'p1', h.now);
    expect(drawing.word).toBe('sopaipilla');
    expect(drawing.wordOptions).toBeNull();
    expect(drawing.mask).toBe('_ _ _ _ _ _ _ _ _ _');
    expect(drawing.endsAt).toBe(h.now + 80_000);
  });

  it('trae los datos de la sala del espectador', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro'], { settings: { rounds: 4 } });
    h.say('p2', 'huemul');
    const snap = buildSnapshot(h.state, 'p2', 123);
    expect(snap).toMatchObject({
      phase: 'DRAWING',
      settings: { rounds: 4, drawSeconds: 80 },
      hostId: 'p1',
      selfId: 'p2',
      round: 1,
      totalRounds: 4,
      serverNow: 123,
      turnEnd: null,
      ranking: null,
    });
    expect(snap.players).toEqual([
      { id: 'p1', name: 'Ana', score: 0, connected: true, isHost: true, guessed: false },
      { id: 'p2', name: 'Beto', score: 0, connected: true, isHost: false, guessed: true },
      { id: 'p3', name: 'Caro', score: 0, connected: true, isHost: false, guessed: false },
    ]);
    expect(snap).not.toHaveProperty('code');
    expect(snap).not.toHaveProperty('strokes');
  });

  it('en TURN_END trae turnEnd y la máscara, sin la palabra suelta; en GAME_END, el ranking', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    chooseWord(h);
    h.say('p2', 'huemul');
    const turnEnd = buildSnapshot(h.state, 'p2', h.now);
    expect(turnEnd.phase).toBe('TURN_END');
    expect(turnEnd.turnEnd?.word).toBe('huemul');
    expect(turnEnd.word).toBeNull();
    expect(turnEnd.players.find((p) => p.id === 'p2')?.guessed).toBe(true);

    while (h.state.phase !== 'GAME_END') h.advanceTo(h.state.deadline ?? h.now);
    const end = buildSnapshot(h.state, 'p1', h.now);
    expect(end.ranking).toHaveLength(2);
    expect(end.turnEnd).toBeNull();
    expect(end.endsAt).toBeNull();
    expect(end.drawerId).toBeNull();
    expect(end.players.every((p) => !p.guessed)).toBe(true);
  });

  it('quien entra a mitad del dibujo recibe un snapshot sin la palabra', () => {
    const h = drawingGame(['Ana', 'Beto']);
    const mark = h.effects.length;
    const late = h.join('Caro');
    const fx = h.since(mark);
    const [snap] = snapshotsOf(fx);
    expect(snap?.playerId).toBe(late);
    expect(snap?.snapshot.word).toBeNull();
    expect(snap?.snapshot.phase).toBe('DRAWING');
    assertNoWordLeak(fx, 'huemul', ['p1']);
    expect(emitsOf(fx, 'player:joined')).toHaveLength(1);
  });

  it('el snapshot de LOBBY no trae turno', () => {
    const h = createHarness();
    h.join('Ana');
    const snap = snapshotsOf(h.last.effects)[0]?.snapshot;
    expect(snap).toMatchObject({
      phase: 'LOBBY',
      round: 0,
      drawerId: null,
      mask: null,
      endsAt: null,
      word: null,
      wordOptions: null,
      turnEnd: null,
      ranking: null,
    });
  });
});

describe('canDraw', () => {
  it('solo el dibujante, y solo en DRAWING', () => {
    const h = createHarness();
    h.joinAll('Ana', 'Beto');
    expect(canDraw(h.state, 'p1')).toBe(false);
    h.dispatch({ type: 'start', playerId: 'p1' });
    expect(canDraw(h.state, 'p1')).toBe(false); // CHOOSING
    chooseWord(h);
    expect(canDraw(h.state, 'p1')).toBe(true);
    expect(canDraw(h.state, 'p2')).toBe(false);
    expect(canDraw(h.state, 'nadie')).toBe(false);
    h.advanceTo(h.state.deadline!);
    expect(h.state.phase).toBe('TURN_END');
    expect(canDraw(h.state, 'p1')).toBe(false);
  });
});

describe('fugas', () => {
  it('assertNoWordLeak detecta una palabra enviada a quien no la conoce', () => {
    const effects = [
      {
        type: 'emit',
        to: { kind: 'room' },
        event: 'message:new',
        payload: { playerId: 'p2', text: 'es el Huemul!', channel: 'all' },
      },
    ] as const;
    expect(() => assertNoWordLeak(effects, 'huemul', ['p1'])).toThrow(/Fuga/);
    expect(() =>
      assertNoWordLeak([{ ...effects[0], to: { kind: 'player', playerId: 'p1' } }], 'huemul', [
        'p1',
      ]),
    ).not.toThrow();
  });
});
