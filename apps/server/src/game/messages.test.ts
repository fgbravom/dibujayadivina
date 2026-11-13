import { describe, expect, it } from 'vitest';
import { classifyGuess } from './messages.js';
import { createHarness, drawingGame, emitsOf, startedGame, word } from './testing.js';

const OPTIONS = [[word('sandía'), word('año'), word('micro', ['la micro'])]];

describe('classifyGuess', () => {
  it('distingue acierto, palabra contenida, casi y texto común', () => {
    const answers = ['micro', 'la micro'];
    expect(classifyGuess('micro', answers)).toBe('correct');
    expect(classifyGuess('la micro', answers)).toBe('correct');
    expect(classifyGuess('es la micro', answers)).toBe('contains');
    expect(classifyGuess('micros', answers)).toBe('close');
    expect(classifyGuess('microondas', answers)).toBe('plain');
    expect(classifyGuess('', answers)).toBe('plain');
  });
});

describe('intentos', () => {
  it('acierta con tildes y mayúsculas distintas', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro'], { pickScript: OPTIONS });
    h.say('p2', '  SANDIA!  ');
    expect(emitsOf(h.last.effects, 'guess:correct')).toHaveLength(1);
    expect(h.state.turn?.guesses).toEqual([{ playerId: 'p2', points: 10 }]);
  });

  it('acierta con una alternativa aceptada', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro'], { pickScript: OPTIONS }, 2);
    h.say('p2', 'La Micro');
    expect(h.state.turn?.guesses.map((g) => g.playerId)).toEqual(['p2']);
  });

  it('"ano" no acierta "año": es un casi', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro'], { pickScript: OPTIONS }, 1);
    h.say('p2', 'ano');
    expect(emitsOf(h.last.effects, 'guess:correct')).toHaveLength(0);
    expect(h.state.turn?.guesses).toEqual([]);
    expect(emitsOf(h.last.effects, 'guess:close')).toHaveLength(1);
  });

  it('el acierto no emite el texto; sí guess:correct a la sala y turn:word al autor', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemul');
    const events = h.last.effects.map((e) => (e.type === 'emit' ? e.event : e.type));
    expect(events).toEqual(['guess:correct', 'turn:word', 'turn:timer']);
    expect(emitsOf(h.last.effects, 'message:new')).toHaveLength(0);

    const [correct] = emitsOf(h.last.effects, 'guess:correct');
    expect(correct?.to).toEqual({ kind: 'room' });
    expect(correct?.payload).toEqual({ playerId: 'p2' });
    const [wordFx] = emitsOf(h.last.effects, 'turn:word');
    expect(wordFx?.to).toEqual({ kind: 'player', playerId: 'p2' });
    expect(wordFx?.payload).toEqual({ word: 'huemul' });
  });

  it('distancia 1 emite el mensaje a la sala y luego guess:close solo al autor', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemol');
    const fx = h.last.effects;
    expect(fx.map((e) => (e.type === 'emit' ? e.event : e.type))).toEqual([
      'message:new',
      'guess:close',
    ]);
    expect(emitsOf(fx, 'message:new')[0]).toMatchObject({
      to: { kind: 'room' },
      payload: { playerId: 'p2', text: 'huemol', channel: 'all' },
    });
    expect(emitsOf(fx, 'guess:close')[0]?.to).toEqual({ kind: 'player', playerId: 'p2' });
  });

  it('distancia 2 es un mensaje común', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huamol');
    expect(emitsOf(h.last.effects, 'guess:close')).toHaveLength(0);
    expect(emitsOf(h.last.effects, 'message:new')).toHaveLength(1);
  });

  it('un mensaje que contiene la palabra solo llega a su autor', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'es el huemul?');
    expect(h.last.effects).toHaveLength(1);
    const [msg] = emitsOf(h.last.effects, 'message:new');
    expect(msg?.to).toEqual({ kind: 'player', playerId: 'p2' });
    expect(msg?.payload.channel).toBe('all');
    expect(h.state.turn?.guesses).toEqual([]);
  });

  it('un mensaje que contiene una alternativa aceptada también se retiene', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro'], { pickScript: OPTIONS }, 2);
    h.say('p2', 'es la micro?');
    expect(emitsOf(h.last.effects, 'message:new')[0]?.to).toEqual({
      kind: 'player',
      playerId: 'p2',
    });
  });

  it('el dibujante y quien ya acertó escriben al canal guessed', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemul');

    h.say('p1', 'huemul'); // el dibujante puede escribir la palabra
    expect(emitsOf(h.last.effects, 'message:new')[0]).toMatchObject({
      to: { kind: 'players', playerIds: ['p1', 'p2'] },
      payload: { playerId: 'p1', text: 'huemul', channel: 'guessed' },
    });

    h.say('p2', 'ya la tengo');
    expect(emitsOf(h.last.effects, 'message:new')[0]).toMatchObject({
      to: { kind: 'players', playerIds: ['p1', 'p2'] },
      payload: { playerId: 'p2', channel: 'guessed' },
    });
    expect(h.state.turn?.guesses).toHaveLength(1);
  });

  it('un mensaje vacío no emite ni da error', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const res = h.say('p2', '   ');
    expect(res.error).toBeUndefined();
    expect(res.effects).toEqual([]);
  });

  it('un jugador que no está en la sala da not_in_room', () => {
    const h = drawingGame(['Ana', 'Beto']);
    expect(h.say('nadie', 'hola').error).toBe('not_in_room');
  });

  it('fuera de DRAWING es chat normal para todos, también el dibujante', () => {
    const h = createHarness();
    h.joinAll('Ana', 'Beto');
    h.say('p1', 'hola');
    expect(emitsOf(h.last.effects, 'message:new')[0]).toMatchObject({
      to: { kind: 'room' },
      payload: { playerId: 'p1', text: 'hola', channel: 'all' },
    });

    h.dispatch({ type: 'start', playerId: 'p1' });
    expect(h.state.phase).toBe('CHOOSING');
    h.say('p1', 'huemul'); // el dibujante en CHOOSING: chat común, sin filtrar nada
    expect(emitsOf(h.last.effects, 'message:new')[0]?.to).toEqual({ kind: 'room' });
    h.say('p2', 'hola dibujante');
    expect(emitsOf(h.last.effects, 'message:new')[0]?.to).toEqual({ kind: 'room' });
  });

  it('en TURN_END y GAME_END también es chat para todos', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    h.advanceBy(10_000);
    h.advanceTo(h.state.deadline!);
    expect(h.state.phase).toBe('TURN_END');
    h.say('p2', 'huemul');
    expect(emitsOf(h.last.effects, 'guess:correct')).toHaveLength(0);
    expect(emitsOf(h.last.effects, 'message:new')[0]?.to).toEqual({ kind: 'room' });

    while (h.state.phase !== 'GAME_END') h.advanceTo(h.state.deadline ?? h.now);
    h.say('p1', 'buena partida');
    expect(emitsOf(h.last.effects, 'message:new')[0]?.to).toEqual({ kind: 'room' });
  });
});

describe('tiempo', () => {
  it('el primer acierto acorta a 20 s si quedaba más', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const t0 = h.now;
    h.advanceBy(10_000);
    h.say('p2', 'huemul');
    expect(h.state.deadline).toBe(t0 + 30_000);
    const [timer] = emitsOf(h.last.effects, 'turn:timer');
    expect(timer?.to).toEqual({ kind: 'room' });
    expect(timer?.payload).toEqual({ endsAt: t0 + 30_000 });

    h.advanceTo(t0 + 29_999);
    expect(h.state.phase).toBe('DRAWING');
    h.advanceTo(t0 + 30_000);
    expect(h.state.phase).toBe('TURN_END');
    expect(emitsOf(h.effects, 'turn:end')[0]?.payload.reason).toBe('time');
  });

  it('no alarga si quedaba menos de 20 s', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const t0 = h.now;
    h.advanceBy(70_000);
    h.say('p2', 'huemul');
    expect(h.state.deadline).toBe(t0 + 80_000);
    expect(emitsOf(h.last.effects, 'turn:timer')).toHaveLength(0);
  });

  it('con exactamente 20 s restantes tampoco cambia el plazo', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const t0 = h.now;
    h.advanceBy(60_000);
    h.say('p2', 'huemul');
    expect(h.state.deadline).toBe(t0 + 80_000);
    expect(emitsOf(h.last.effects, 'turn:timer')).toHaveLength(0);
  });

  it('el segundo acierto no acorta de nuevo', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro', 'Dani']);
    const t0 = h.now;
    h.advanceBy(10_000);
    h.say('p2', 'huemul');
    h.advanceBy(2_000);
    h.say('p3', 'huemul');
    expect(h.state.deadline).toBe(t0 + 30_000);
    expect(emitsOf(h.effects, 'turn:timer')).toHaveLength(1);
  });

  it('acortar descarta las pistas que quedan fuera de plazo', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const t0 = h.now;
    h.advanceTo(t0 + 25_000);
    h.say('p2', 'huemul'); // nuevo plazo en t0 + 45 s: sobrevive la pista de 40 s, no la de 60 s
    expect(h.state.deadline).toBe(t0 + 45_000);
    expect(h.state.turn?.pendingHints).toEqual([t0 + 40_000]);
    h.advanceTo(t0 + 45_000);
    expect(emitsOf(h.effects, 'turn:hint')).toHaveLength(1);
  });

  it('con un acierto temprano no queda ninguna pista pendiente', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemul');
    expect(h.state.turn?.pendingHints).toEqual([]);
    h.advanceBy(20_000);
    expect(emitsOf(h.effects, 'turn:hint')).toHaveLength(0);
  });

  it('un intento tras el plazo es chat de TURN_END', () => {
    const h = drawingGame(['Ana', 'Beto']);
    h.now = h.state.deadline! + 1;
    const res = h.say('p2', 'huemul');
    expect(emitsOf(res.effects, 'guess:correct')).toHaveLength(0);
    expect(emitsOf(res.effects, 'message:new')[0]?.to).toEqual({ kind: 'room' });
    expect(h.state.turn?.guesses).toEqual([]);
  });
});

describe('puntaje en el motor', () => {
  it('10, 8, 6, 4, 4 para los adivinadores y 10 + 1 por acierto extra al dibujante', () => {
    const h = drawingGame(['Ana', 'B', 'C', 'D', 'E', 'F']);
    for (const id of ['p2', 'p3', 'p4', 'p5', 'p6']) h.say(id, 'huemul');
    expect(h.state.phase).toBe('TURN_END');
    const [end] = emitsOf(h.last.effects, 'turn:end');
    expect(end?.payload.gains).toEqual({ p1: 14, p2: 10, p3: 8, p4: 6, p5: 4, p6: 4 });
    expect(end?.payload.scores).toEqual(end?.payload.gains);
  });

  it('sin aciertos el dibujante gana 0', () => {
    const h = drawingGame(['Ana', 'Beto']);
    h.advanceTo(h.state.deadline!);
    expect(h.state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('los puntajes se suman recién en TURN_END, sin player:updated durante el turno', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const mark = h.effects.length;
    h.say('p2', 'huemul');
    expect(h.state.players.map((p) => p.score)).toEqual([0, 0, 0]);
    expect(emitsOf(h.since(mark), 'player:updated')).toHaveLength(0);
    h.say('p3', 'huemul');
    expect(h.state.players.map((p) => p.score)).toEqual([11, 10, 8]);
    expect(emitsOf(h.since(mark), 'player:updated')).toHaveLength(0);
    expect(emitsOf(h.last.effects, 'turn:end')[0]?.payload.scores).toEqual({
      p1: 11,
      p2: 10,
      p3: 8,
    });
  });

  it('drawerLeft anula el turno aunque hubiera aciertos', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemul');
    h.dispatch({ type: 'leave', playerId: 'p1' });
    expect(h.state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('quien acertó y se fue pierde sus puntos, pero su acierto cuenta para el dibujante', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro', 'Dani']);
    h.say('p2', 'huemul');
    h.dispatch({ type: 'leave', playerId: 'p2' });
    h.say('p3', 'huemul');
    h.say('p4', 'huemul');
    expect(h.state.phase).toBe('TURN_END');
    const [end] = emitsOf(h.last.effects, 'turn:end');
    // Ana: 10 + 1 + 1 por tres aciertos (incluido el de Beto, que se fue).
    expect(end?.payload.gains).toEqual({ p1: 12, p3: 8, p4: 6 });
    expect(end?.payload.scores).toEqual({ p1: 12, p3: 8, p4: 6 });
  });

  it('los puntajes se acumulan entre turnos', () => {
    const h = startedGame(['Ana', 'Beto']);
    h.advanceBy(10_000); // elige huemul solo
    h.say('p2', 'huemul');
    h.advanceTo(h.state.deadline!); // cierre del turno 1 -> CHOOSING de Beto
    expect(h.state.players.map((p) => p.score)).toEqual([10, 10]);
    expect(h.state.turn?.options.map((o) => o.text)).toEqual(['mote con huesillo', 'te', 'volcan']);
    h.dispatch({ type: 'chooseWord', playerId: 'p2', index: 2 });
    h.say('p1', 'volcan');
    expect(h.state.players.map((p) => p.score)).toEqual([20, 20]);
  });
});
