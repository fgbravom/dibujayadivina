import { getMaskableIndices, maskWord, maxRevealCount } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { nextWakeAt } from './reducer.js';
import { chooseWord, createHarness, drawingGame, emitsOf, startedGame, word } from './testing.js';
import type { Harness } from './testing.js';

const GRACE = 30_000;

describe('elegir palabra', () => {
  it('turn:options llega solo al dibujante', () => {
    const h = createHarness();
    h.joinAll('Ana', 'Beto', 'Caro');
    h.dispatch({ type: 'start', playerId: h.idAt(0) });
    const options = emitsOf(h.last.effects, 'turn:options');
    expect(options).toHaveLength(1);
    expect(options[0]?.to).toEqual({ kind: 'player', playerId: 'p1' });
    expect(options[0]?.payload.words).toEqual(['huemul', 'sopaipilla', 'micro']);
  });

  it('chooseWord de otro jugador da not_drawer', () => {
    const h = startedGame(['Ana', 'Beto']);
    const res = h.dispatch({ type: 'chooseWord', playerId: h.idAt(1), index: 0 });
    expect(res.error).toBe('not_drawer');
    expect(res.effects).toEqual([]);
    expect(h.state.phase).toBe('CHOOSING');
  });

  it.each([-1, 3, 1.5, Number.NaN])('el índice %s da invalid_payload', (index) => {
    const h = startedGame(['Ana', 'Beto']);
    const res = h.dispatch({ type: 'chooseWord', playerId: h.idAt(0), index });
    expect(res.error).toBe('invalid_payload');
    expect(h.state.phase).toBe('CHOOSING');
  });

  it('chooseWord fuera de CHOOSING da wrong_phase', () => {
    const h = createHarness();
    const [a] = h.joinAll('Ana', 'Beto');
    expect(h.dispatch({ type: 'chooseWord', playerId: a!, index: 0 }).error).toBe('wrong_phase');
  });

  it('elegir pasa a DRAWING con la opción pedida', () => {
    const h = startedGame(['Ana', 'Beto']);
    chooseWord(h, 2);
    expect(h.state.phase).toBe('DRAWING');
    expect(h.state.turn?.word?.text).toBe('micro');
    expect(h.state.turn?.answers).toEqual(['micro', 'la micro']);
  });

  it('al vencer el plazo se asigna la primera opción', () => {
    const h = startedGame(['Ana', 'Beto']);
    h.advanceBy(9_999);
    expect(h.state.phase).toBe('CHOOSING');
    h.advanceBy(1);
    expect(h.state.phase).toBe('DRAWING');
    expect(h.state.turn?.word?.text).toBe('huemul');
    expect(emitsOf(h.effects, 'turn:start')).toHaveLength(1);
  });

  it('un chooseWord tardío se evalúa contra la fase nueva y da wrong_phase', () => {
    const h = startedGame(['Ana', 'Beto']);
    h.now += 10_001;
    const res = h.dispatch({ type: 'chooseWord', playerId: h.idAt(0), index: 2 });
    expect(res.error).toBe('wrong_phase');
    expect(h.state.phase).toBe('DRAWING');
    expect(h.state.turn?.word?.text).toBe('huemul');
    // El error conserva los efectos de advance: el turno que empezó por vencimiento.
    expect(emitsOf(res.effects, 'turn:start')).toHaveLength(1);
  });

  it('las opciones no se repiten en toda la partida', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 3 } });
    while (h.state.phase !== 'GAME_END') h.advanceTo(h.state.deadline ?? h.now);
    const offered = emitsOf(h.effects, 'turn:options').flatMap((e) => e.payload.words);
    expect(offered).toHaveLength(6 * 3);
    expect(new Set(offered).size).toBe(offered.length);
    expect(h.state.usedWords).toEqual(offered);
  });
});

describe('dibujo y pistas', () => {
  it('turn:start lleva la máscara y turn:word va solo al dibujante', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro']);
    const t0 = h.now;
    chooseWord(h, 0);
    const [start] = emitsOf(h.last.effects, 'turn:start');
    expect(start?.to).toEqual({ kind: 'room' });
    expect(start?.payload).toEqual({
      drawerId: 'p1',
      mask: '_ _ _ _ _ _',
      endsAt: t0 + 80_000,
      round: 1,
      totalRounds: 3,
    });
    const words = emitsOf(h.last.effects, 'turn:word');
    expect(words).toHaveLength(1);
    expect(words[0]?.to).toEqual({ kind: 'player', playerId: 'p1' });
    expect(words[0]?.payload).toEqual({ word: 'huemul' });
  });

  it('las pistas salen al 50 % y al 75 % del tiempo de dibujo', () => {
    const h = drawingGame(['Ana', 'Beto']);
    const t0 = h.now;
    expect(h.state.turn?.pendingHints).toEqual([t0 + 40_000, t0 + 60_000]);

    h.advanceTo(t0 + 39_999);
    expect(emitsOf(h.effects, 'turn:hint')).toHaveLength(0);
    h.advanceTo(t0 + 40_000);
    expect(emitsOf(h.effects, 'turn:hint')).toHaveLength(1);
    h.advanceTo(t0 + 59_999);
    expect(emitsOf(h.effects, 'turn:hint')).toHaveLength(1);
    h.advanceTo(t0 + 60_000);
    const hints = emitsOf(h.effects, 'turn:hint');
    expect(hints).toHaveLength(2);
    expect(hints.every((e) => e.to.kind === 'room')).toBe(true);
  });

  it('palabras de 3 a 5 letras tienen una sola pista', () => {
    for (const text of ['mar', 'casa', 'micro']) {
      const h = drawingGame(['Ana', 'Beto'], { pickScript: [[word(text), word('x'), word('y')]] });
      expect(h.state.turn?.pendingHints, text).toHaveLength(1);
    }
  });

  it('una palabra de 2 letras no tiene pistas', () => {
    const h = drawingGame(['Ana', 'Beto'], { pickScript: [[word('te'), word('x'), word('y')]] });
    expect(h.state.turn?.pendingHints).toEqual([]);
    h.advanceBy(79_000);
    expect(emitsOf(h.effects, 'turn:hint')).toHaveLength(0);
  });

  it('las pistas no revelan espacios ni se repiten, y la máscara usa maskWord', () => {
    const text = 'mote con huesillo';
    const h = drawingGame(['Ana', 'Beto'], {
      pickScript: [[word(text), word('x'), word('y')]],
    });
    h.advanceBy(60_000);
    const hints = emitsOf(h.effects, 'turn:hint');
    expect(hints).toHaveLength(2);

    const revealed = h.state.turn?.revealed ?? [];
    const maskable = getMaskableIndices(text);
    expect(new Set(revealed).size).toBe(2);
    expect(revealed.every((i) => maskable.includes(i))).toBe(true);
    expect(hints[1]?.payload.mask).toBe(maskWord(text, revealed));
    expect(hints[0]?.payload.mask).toBe(maskWord(text, revealed.slice(0, 1)));
    expect(hints[1]?.payload.mask).not.toBe(hints[0]?.payload.mask);
  });

  it('nunca se revela más de un tercio de la palabra', () => {
    for (const text of ['huemul', 'micro', 'mar', 'sopaipilla', 'mote con huesillo']) {
      const h = drawingGame(['Ana', 'Beto'], { pickScript: [[word(text), word('x'), word('y')]] });
      h.advanceBy(79_000);
      expect(h.state.turn?.revealed.length, text).toBeLessThanOrEqual(maxRevealCount(text));
    }
  });

  it('nextWakeAt es el mínimo entre plazo, pista y gracia', () => {
    const h = createHarness();
    expect(nextWakeAt(h.state)).toBeNull();
    h.joinAll('Ana', 'Beto', 'Caro');
    expect(nextWakeAt(h.state)).toBeNull();
    h.dispatch({ type: 'start', playerId: h.idAt(0) });
    expect(nextWakeAt(h.state)).toBe(h.now + 10_000);

    chooseWord(h);
    const t0 = h.now;
    expect(nextWakeAt(h.state)).toBe(t0 + 40_000); // la pista gana al plazo de 80 s

    h.advanceBy(15_000);
    h.disconnect(h.idAt(2));
    expect(nextWakeAt(h.state)).toBe(t0 + 40_000); // gracia en t0 + 45 s: la pista sigue primero
    h.advanceTo(t0 + 40_000);
    expect(nextWakeAt(h.state)).toBe(t0 + 45_000); // ahora gana la gracia a la pista de 60 s
    h.advanceTo(t0 + 45_000);
    expect(nextWakeAt(h.state)).toBe(t0 + 60_000);
  });

  it('la gracia puede ser el próximo vencimiento', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const t0 = h.now;
    h.advanceBy(1_000);
    h.disconnect(h.idAt(2));
    expect(nextWakeAt(h.state)).toBe(t0 + 1_000 + GRACE); // 31 s < pista de 40 s
    h.advanceTo(t0 + 1_000 + GRACE);
    expect(h.state.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(nextWakeAt(h.state)).toBe(t0 + 40_000);
  });

  it('en GAME_END y LOBBY no hay vencimientos', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    while (h.state.phase !== 'GAME_END') h.advanceTo(h.state.deadline ?? h.now);
    expect(nextWakeAt(h.state)).toBeNull();
  });
});

describe('fin de turno', () => {
  it('por tiempo: reason time, todos con 0 si nadie acertó', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const t0 = h.now;
    h.advanceTo(t0 + 80_000);
    expect(h.state.phase).toBe('TURN_END');
    const [end] = emitsOf(h.effects, 'turn:end');
    expect(end?.to).toEqual({ kind: 'room' });
    expect(end?.payload).toEqual({
      word: 'huemul',
      gains: { p1: 0, p2: 0, p3: 0 },
      scores: { p1: 0, p2: 0, p3: 0 },
      reason: 'time',
    });
  });

  it('cuando todos acertaron termina al instante con all_guessed', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemul');
    expect(h.state.phase).toBe('DRAWING');
    h.say('p3', 'huemul');
    expect(h.state.phase).toBe('TURN_END');
    const [end] = emitsOf(h.last.effects, 'turn:end');
    expect(end?.payload.reason).toBe('all_guessed');
    // El orden causal: acierto primero, fin de turno después, sin acortar el tiempo.
    const events = h.last.effects.map((e) => (e.type === 'emit' ? e.event : e.type));
    expect(events).toEqual(['guess:correct', 'turn:word', 'turn:end']);
  });

  it('un adivinador desconectado no bloquea el fin de turno', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemul');
    h.disconnect('p3');
    expect(h.state.phase).toBe('TURN_END');
    expect(h.state.turn?.result?.reason).toBe('all_guessed');
  });

  it('un adivinador ya desconectado antes del acierto tampoco bloquea', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.disconnect('p3');
    expect(h.state.phase).toBe('DRAWING');
    h.say('p2', 'huemul');
    expect(h.state.phase).toBe('TURN_END');
  });

  it('sin aciertos no termina aunque nadie quede por adivinar', () => {
    const h = drawingGame(['Ana', 'Beto']);
    h.disconnect('p2');
    expect(h.state.phase).toBe('DRAWING');
  });

  it('el dibujante se desconecta en DRAWING: drawer_left y nadie puntúa', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say('p2', 'huemul');
    h.disconnect('p1');
    expect(h.state.phase).toBe('TURN_END');
    const [end] = emitsOf(h.last.effects, 'turn:end');
    expect(end?.payload.reason).toBe('drawer_left');
    expect(end?.payload.gains).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(end?.payload.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('el dibujante se desconecta en CHOOSING: se salta su turno sin turn:end', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro']);
    const mark = h.effects.length;
    h.disconnect('p1');
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.turn?.drawerId).toBe('p2');
    expect(h.state.drawnThisRound).toEqual(['p1', 'p2']);
    const fx = h.since(mark);
    expect(emitsOf(fx, 'turn:end')).toHaveLength(0);
    expect(emitsOf(fx, 'turn:choosing')).toHaveLength(1);
    expect(fx).toContainEqual({ type: 'strokes:reset' });
    expect(emitsOf(fx, 'turn:options')[0]?.to).toEqual({ kind: 'player', playerId: 'p2' });
  });

  it('TURN_END dura 5 s y el turno siguiente emite strokes:reset', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.advanceTo(h.state.deadline!);
    expect(h.state.phase).toBe('TURN_END');
    const endAt = h.now;
    expect(h.state.deadline).toBe(endAt + 5_000);

    h.advanceBy(4_999);
    expect(h.state.phase).toBe('TURN_END');
    const mark = h.effects.length;
    h.advanceBy(1);
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.turn?.drawerId).toBe('p2');
    const fx = h.since(mark);
    expect(fx[0]).toEqual({ type: 'strokes:reset' });
    expect(emitsOf(fx, 'turn:choosing')).toHaveLength(1);
  });

  it('turn:choosing trae la ronda: la nueva ronda se anuncia antes de turn:start', () => {
    const h = drawingGame(['Ana', 'Beto']);
    h.advanceTo(h.state.deadline!);
    const mark = h.effects.length;
    h.advanceBy(5_000);
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.round).toBe(1);
    expect(emitsOf(h.since(mark), 'turn:choosing')[0]?.payload).toMatchObject({
      drawerId: 'p2',
      round: 1,
      totalRounds: 3,
    });

    chooseWord(h, 0);
    h.advanceTo(h.state.deadline!);
    const mark2 = h.effects.length;
    h.advanceBy(5_000);
    expect(h.state.round).toBe(2);
    expect(emitsOf(h.since(mark2), 'turn:choosing')[0]?.payload).toMatchObject({
      drawerId: 'p1',
      round: 2,
      totalRounds: 3,
    });
  });

  it('el turno que ya venció se cierra antes de evaluar la acción siguiente', () => {
    const h = drawingGame(['Ana', 'Beto']);
    h.now = h.state.deadline! + 1;
    const res = h.say('p2', 'huemul');
    expect(h.state.phase).toBe('TURN_END');
    expect(emitsOf(res.effects, 'guess:correct')).toHaveLength(0);
    expect(emitsOf(res.effects, 'turn:end')[0]?.payload.reason).toBe('time');
  });

  it('un salto largo de reloj procesa los vencimientos pendientes', () => {
    const h = drawingGame(['Ana', 'Beto']);
    h.now += 10 * 60_000;
    expect(() => h.dispatch({ type: 'tick' })).not.toThrow();
    expect(emitsOf(h.effects, 'turn:hint')).toHaveLength(2);
    expect(h.state.phase).toBe('TURN_END');
  });

  it('superar el tope de vencimientos seguidos lanza error', () => {
    const h = createHarness({
      config: { chooseMs: 0, drawMsOverride: 0, turnEndMs: 0 },
      settings: { rounds: 10 },
    });
    h.joinAll('Ana', 'Beto');
    h.dispatch({ type: 'start', playerId: 'p1' });
    expect(() => h.dispatch({ type: 'tick' })).toThrow(/vencimientos/);
  });
});

function playToEnd(h: Harness): string[] {
  const drawers: string[] = [];
  while (h.state.phase !== 'GAME_END') {
    if (h.state.phase === 'CHOOSING' && h.state.turn) drawers.push(h.state.turn.drawerId);
    h.advanceTo(h.state.deadline ?? h.now);
  }
  return drawers;
}

describe('rondas', () => {
  it('cada jugador dibuja una vez por ronda, en orden de llegada', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro'], { settings: { rounds: 2 } });
    expect(playToEnd(h)).toEqual(['p1', 'p2', 'p3', 'p1', 'p2', 'p3']);
    const rounds = emitsOf(h.effects, 'turn:start').map((e) => e.payload.round);
    expect(rounds).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('el desconectado se salta y dibuja si vuelve a tiempo', () => {
    const h = createHarness({
      config: { chooseMs: 1_000, drawMsOverride: 5_000 },
      settings: { rounds: 1 },
    });
    h.joinAll('Ana', 'Beto', 'Caro');
    h.dispatch({ type: 'start', playerId: 'p1' });
    h.advanceBy(500);
    h.disconnect('p2'); // la gracia vence mucho después de que le toque
    // Turno de p1: 1 s elegir + 5 s dibujar + 5 s de cierre; luego le toca a p2, que está caído.
    h.advanceTo(h.now + 11_000);
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.turn?.drawerId).toBe('p3');

    h.join('Beto'); // vuelve dentro de la gracia
    h.advanceTo(h.state.deadline!); // elegir -> dibujar
    h.advanceTo(h.state.deadline!); // dibujar -> cierre
    h.advanceTo(h.state.deadline!); // cierre -> siguiente
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.turn?.drawerId).toBe('p2');
    expect(h.state.round).toBe(1);
  });

  it('el desconectado cuyo turno pasó sin volver no dibuja en esa ronda', () => {
    const h = createHarness({
      config: { chooseMs: 1_000, drawMsOverride: 5_000 },
      settings: { rounds: 2 },
    });
    h.joinAll('Ana', 'Beto', 'Caro');
    h.dispatch({ type: 'start', playerId: 'p1' });
    h.disconnect('p2');
    const drawers = playToEnd(h);
    // p2 se borra por gracia vencida: dibujan p1 y p3, y la ronda 2 también sin él.
    expect(drawers).not.toContain('p2');
    expect(drawers.slice(0, 2)).toEqual(['p1', 'p3']);
  });

  it('quien entra tarde adivina de inmediato y dibuja al final de la ronda', () => {
    const h = drawingGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    const late = h.join('Caro');
    h.say(late, 'huemul');
    expect(emitsOf(h.last.effects, 'guess:correct')[0]?.payload).toEqual({ playerId: late });
    expect(h.state.turn?.guesses.map((g) => g.playerId)).toEqual([late]);

    expect(playToEnd(h)).toEqual(['p2', 'p3']);
  });

  it('tras la última ronda hay TURN_END y luego GAME_END', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    chooseWord(h);
    h.advanceTo(h.state.deadline!);
    h.advanceTo(h.state.deadline!); // cierre del turno 1 -> turno 2
    chooseWord(h);
    h.advanceTo(h.state.deadline!);
    expect(h.state.phase).toBe('TURN_END');
    expect(emitsOf(h.effects, 'game:end')).toHaveLength(0);
    h.advanceTo(h.state.deadline!);
    expect(h.state.phase).toBe('GAME_END');
    expect(h.state.turn).toBeNull();
    expect(h.state.deadline).toBeNull();
    expect(emitsOf(h.effects, 'game:end')).toHaveLength(1);
  });

  it('si todos los candidatos están caídos al cambiar de turno, la partida termina', () => {
    const h = createHarness({ config: { chooseMs: 1_000, drawMsOverride: 5_000 } });
    h.joinAll('Ana', 'Beto');
    h.dispatch({ type: 'start', playerId: 'p1' });
    h.advanceBy(1_000);
    h.disconnect('p2');
    h.disconnect('p1'); // dibujante en DRAWING: drawer_left; nadie conectado
    expect(h.state.phase).toBe('TURN_END');
    h.advanceBy(5_000);
    expect(h.state.phase).toBe('GAME_END');
  });
});

describe('fin de partida', () => {
  it('game:end sale ordenado y GAME_END no vence solo', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro'], { settings: { rounds: 1 } });
    // Ana dibuja y Beto acierta; luego nadie más puntúa.
    chooseWord(h);
    h.say('p2', 'huemul');
    playToEnd(h);
    const [end] = emitsOf(h.effects, 'game:end');
    expect(end?.payload.ranking.map((r) => [r.playerId, r.score, r.rank])).toEqual([
      ['p1', 10, 1],
      ['p2', 10, 1],
      ['p3', 0, 3],
    ]);
    h.advanceBy(60 * 60_000);
    expect(h.state.phase).toBe('GAME_END');
    expect(h.state.ranking).toHaveLength(3);
  });

  it('al terminar la partida emite strokes:reset junto con game:end', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    while (h.state.phase !== 'GAME_END') h.advanceTo(h.state.deadline ?? h.now);
    const fx = h.last.effects;
    const iReset = fx.findIndex((e) => e.type === 'strokes:reset');
    const iEnd = fx.findIndex((e) => e.type === 'emit' && e.event === 'game:end');
    expect(iEnd).toBeGreaterThanOrEqual(0);
    expect(iReset).toBeGreaterThanOrEqual(0);
    expect(iReset).toBeLessThan(iEnd);
  });

  it('start del anfitrión en GAME_END lleva a LOBBY conservando los puntajes', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    chooseWord(h);
    h.say('p2', 'huemul');
    playToEnd(h);
    const mark = h.effects.length;
    const res = h.dispatch({ type: 'start', playerId: 'p1' });
    expect(res.error).toBeUndefined();
    expect(h.state.phase).toBe('LOBBY');
    expect(h.state.ranking).toBeNull();
    expect(h.state.round).toBe(0);
    expect(h.state.players.map((p) => p.score)).toEqual([10, 10]);
    expect(h.since(mark)).toContainEqual({ type: 'strokes:reset' });
    const snaps = h.since(mark).filter((e) => e.type === 'snapshot');
    expect(snaps).toHaveLength(2);
  });

  it('start en GAME_END de quien no es anfitrión da not_host', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    playToEnd(h);
    const res = h.dispatch({ type: 'start', playerId: 'p2' });
    expect(res.error).toBe('not_host');
    expect(h.state.phase).toBe('GAME_END');
  });

  it('si el anfitrión se va en GAME_END, el rol se transfiere y el nuevo reinicia', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro'], { settings: { rounds: 1 } });
    playToEnd(h);
    h.dispatch({ type: 'leave', playerId: 'p1' });
    expect(h.state.phase).toBe('GAME_END');
    expect(h.state.hostId).toBe('p2');
    expect(h.dispatch({ type: 'start', playerId: 'p2' }).error).toBeUndefined();
    expect(h.state.phase).toBe('LOBBY');
  });

  it('conserva usedWords entre partidas sucesivas de la misma sala', () => {
    const h = startedGame(['Ana', 'Beto'], { settings: { rounds: 1 } });
    playToEnd(h);
    const previousUsed = [...h.state.usedWords];
    expect(previousUsed.length).toBeGreaterThan(0);

    // Volver al lobby y empezar una segunda partida.
    expect(h.dispatch({ type: 'start', playerId: 'p1' }).error).toBeUndefined();
    expect(h.state.phase).toBe('LOBBY');
    expect(h.dispatch({ type: 'start', playerId: 'p1' }).error).toBeUndefined();
    expect(h.state.phase).toBe('CHOOSING');

    // Las palabras de la partida anterior se conservan y las nuevas opciones no se repiten.
    for (const word of previousUsed) {
      expect(h.state.usedWords).toContain(word);
    }
    const newOptions = h.state.turn?.options.map((o) => o.text) ?? [];
    for (const word of newOptions) {
      expect(previousUsed).not.toContain(word);
    }
  });
});

describe('estado acotado', () => {
  it('al borrar un jugador se quita de drawnThisRound', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.advanceTo(h.state.deadline!); // TURN_END
    h.advanceTo(h.state.deadline!); // turno de Beto
    expect(h.state.drawnThisRound).toEqual(['p1', 'p2']);
    h.dispatch({ type: 'leave', playerId: 'p1' });
    expect(h.state.drawnThisRound).toEqual(['p2']);
  });

  it('el borrado por fin de la gracia también lo quita', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.disconnect('p3');
    h.advanceBy(GRACE);
    expect(h.state.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(h.state.drawnThisRound).toEqual(['p1']);
    h.dispatch({ type: 'leave', playerId: 'p1' });
    expect(h.state.drawnThisRound).toEqual([]);
  });

  it.each([
    [600, 603],
    [601, 3],
  ])('con %i usedWords, al empezar el turno siguiente quedan %i', (before, after) => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.state.usedWords = Array.from({ length: before }, (_, i) => `usada${i}`);
    h.advanceTo(h.state.deadline!); // TURN_END
    h.advanceTo(h.state.deadline!); // CHOOSING de Beto
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.usedWords).toHaveLength(after);
    if (before > 600) expect(h.state.usedWords).toEqual(h.state.turn?.options.map((o) => o.text));
  });
});
