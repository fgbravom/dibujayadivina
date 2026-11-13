import { describe, expect, it } from 'vitest';
import { createHarness, emitsOf, snapshotsOf, startedGame } from './testing.js';

describe('ajustes', () => {
  it('el anfitrión los cambia en LOBBY y cada conectado recibe snapshot', () => {
    const h = createHarness();
    const [a, b, c] = h.joinAll('Ana', 'Beto', 'Caro');
    h.disconnect(c!);
    const res = h.dispatch({ type: 'updateSettings', playerId: a!, rounds: 5, drawSeconds: 60 });
    expect(res.error).toBeUndefined();
    expect(h.state.settings).toEqual({ rounds: 5, drawSeconds: 60 });
    const snaps = snapshotsOf(res.effects);
    expect(snaps.map((s) => s.playerId)).toEqual([a, b]);
    expect(snaps[0]?.snapshot.settings).toEqual({ rounds: 5, drawSeconds: 60 });
    expect(snaps[0]?.snapshot.totalRounds).toBe(5);
  });

  it('solo el anfitrión: otro recibe not_host y nada cambia', () => {
    const h = createHarness();
    const [, b] = h.joinAll('Ana', 'Beto');
    const res = h.dispatch({ type: 'updateSettings', playerId: b!, rounds: 5, drawSeconds: 60 });
    expect(res.error).toBe('not_host');
    expect(res.effects).toEqual([]);
    expect(h.state.settings).toEqual({ rounds: 3, drawSeconds: 80 });
  });

  it('solo en LOBBY', () => {
    const h = startedGame(['Ana', 'Beto']);
    const res = h.dispatch({
      type: 'updateSettings',
      playerId: h.idAt(0),
      rounds: 5,
      drawSeconds: 60,
    });
    expect(res.error).toBe('wrong_phase');
  });

  it.each([
    [0, 80],
    [11, 80],
    [3, 29],
    [3, 181],
    [2.5, 80],
    [3, 60.5],
    [Number.NaN, 80],
  ])('fuera de rango (%s rondas, %s s) da invalid_payload', (rounds, drawSeconds) => {
    const h = createHarness();
    const [a] = h.joinAll('Ana', 'Beto');
    const res = h.dispatch({ type: 'updateSettings', playerId: a!, rounds, drawSeconds });
    expect(res.error).toBe('invalid_payload');
    expect(h.state.settings).toEqual({ rounds: 3, drawSeconds: 80 });
  });

  it('acepta los extremos del rango', () => {
    const h = createHarness();
    const [a] = h.joinAll('Ana', 'Beto');
    expect(
      h.dispatch({ type: 'updateSettings', playerId: a!, rounds: 1, drawSeconds: 30 }).error,
    ).toBeUndefined();
    expect(
      h.dispatch({ type: 'updateSettings', playerId: a!, rounds: 10, drawSeconds: 180 }).error,
    ).toBeUndefined();
  });
});

describe('inicio', () => {
  it('start sin ser anfitrión da not_host', () => {
    const h = createHarness();
    const [, b] = h.joinAll('Ana', 'Beto');
    expect(h.dispatch({ type: 'start', playerId: b! }).error).toBe('not_host');
    expect(h.state.phase).toBe('LOBBY');
  });

  it('con menos de 2 conectados da not_enough_players', () => {
    const h = createHarness();
    const a = h.join('Ana');
    expect(h.dispatch({ type: 'start', playerId: a }).error).toBe('not_enough_players');

    const b = h.join('Beto');
    h.disconnect(b);
    const res = h.dispatch({ type: 'start', playerId: a });
    expect(res.error).toBe('not_enough_players');
    expect(res.effects).toEqual([]);
    expect(h.state.phase).toBe('LOBBY');
  });

  it('entra en CHOOSING con el primero por orden de llegada como dibujante', () => {
    const h = createHarness();
    const [a] = h.joinAll('Ana', 'Beto', 'Caro');
    const res = h.dispatch({ type: 'start', playerId: a! });
    expect(res.error).toBeUndefined();
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.round).toBe(1);
    expect(h.state.turn?.drawerId).toBe(a);
    expect(h.state.deadline).toBe(h.now + 10_000);
    expect(res.effects[0]).toEqual({ type: 'strokes:reset' });
    const [choosing] = emitsOf(res.effects, 'turn:choosing');
    expect(choosing?.to).toEqual({ kind: 'room' });
    expect(choosing?.payload).toEqual({
      drawerId: a,
      endsAt: h.now + 10_000,
      round: 1,
      totalRounds: 3,
    });
  });

  it('start fuera de LOBBY y GAME_END da wrong_phase', () => {
    const h = startedGame(['Ana', 'Beto']);
    expect(h.dispatch({ type: 'start', playerId: h.idAt(0) }).error).toBe('wrong_phase');
  });

  it('reinicia los puntajes y avisa con player:updated a quien cambió', () => {
    const h = createHarness();
    const [a, b] = h.joinAll('Ana', 'Beto');
    h.state.players[1]!.score = 9;
    const res = h.dispatch({ type: 'start', playerId: a! });
    expect(h.state.players.map((p) => p.score)).toEqual([0, 0]);
    const updated = emitsOf(res.effects, 'player:updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]?.payload).toMatchObject({ id: b, score: 0 });
  });
});
