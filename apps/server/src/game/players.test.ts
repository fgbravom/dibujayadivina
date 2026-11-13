import { NICKNAME_MAX_LENGTH, RECONNECT_GRACE_SECONDS } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { createGame } from './reducer.js';
import { createHarness, drawingGame, emitsOf, snapshotsOf, startedGame } from './testing.js';

const GRACE = RECONNECT_GRACE_SECONDS * 1000;

describe('entrada', () => {
  it('parte en LOBBY con los ajustes por defecto', () => {
    const state = createGame();
    expect(state.phase).toBe('LOBBY');
    expect(state.settings).toEqual({ rounds: 3, drawSeconds: 80 });
    expect(state.players).toEqual([]);
    expect(state.hostId).toBeNull();
  });

  it('el primer join es anfitrión y recibe su snapshot', () => {
    const h = createHarness();
    const id = h.join('Ana');
    expect(h.state.hostId).toBe(id);
    const [snap] = snapshotsOf(h.last.effects);
    expect(snap?.playerId).toBe(id);
    expect(snap?.snapshot.selfId).toBe(id);
    expect(snap?.snapshot.hostId).toBe(id);
    expect(snap?.snapshot.phase).toBe('LOBBY');
    expect(snap?.snapshot.players).toEqual([
      { id, name: 'Ana', score: 0, connected: true, isHost: true, guessed: false },
    ]);
  });

  it('el segundo join avisa al resto, recibe snapshot y no cambia al anfitrión', () => {
    const h = createHarness();
    const [a, b] = h.joinAll('Ana', 'Beto');
    expect(h.state.hostId).toBe(a);
    const joined = emitsOf(h.last.effects, 'player:joined');
    expect(joined).toHaveLength(1);
    expect(joined[0]?.to).toEqual({ kind: 'roomExcept', playerId: b });
    expect(joined[0]?.payload).toMatchObject({ id: b, name: 'Beto', isHost: false });
    expect(snapshotsOf(h.last.effects).map((s) => s.playerId)).toEqual([b]);
  });

  it('rechaza con room_full cuando la sala está llena, sin efectos', () => {
    const h = createHarness({ config: { maxPlayers: 2 } });
    h.joinAll('Ana', 'Beto');
    const res = h.dispatch({ type: 'join', sessionId: 'secret-Caro', name: 'Caro', connId: 'c' });
    expect(res.error).toBe('room_full');
    expect(res.effects).toEqual([]);
    expect(h.state.players).toHaveLength(2);
  });

  it('un nombre repetido recibe sufijo, comparando sin tildes ni mayúsculas', () => {
    const h = createHarness();
    h.joinAll('Ana', 'ANA', 'ána');
    expect(h.state.players.map((p) => p.name)).toEqual(['Ana', 'ANA 2', 'ána 3']);
  });

  it('el sufijo recorta la base para no pasar el largo máximo', () => {
    const h = createHarness();
    const long = 'a'.repeat(NICKNAME_MAX_LENGTH);
    h.join(long);
    h.join(long, { sessionId: 'otra-sesion' });
    const second = h.state.players[1]?.name ?? '';
    expect(second).toBe(`${'a'.repeat(NICKNAME_MAX_LENGTH - 2)} 2`);
    expect(second.length).toBeLessThanOrEqual(NICKNAME_MAX_LENGTH);
  });

  it('la reconexión en gracia conserva puntaje, puesto y anfitrión', () => {
    const h = createHarness();
    const [a, b] = h.joinAll('Ana', 'Beto');
    h.state.players[0]!.score = 7;
    h.disconnect(a!);
    h.advanceBy(10_000);

    const again = h.join('Ana');
    expect(again).toBe(a);
    expect(h.state.players.map((p) => p.id)).toEqual([a, b]);
    expect(h.state.players[0]).toMatchObject({ score: 7, connected: true, disconnectedAt: null });
    expect(h.state.hostId).toBe(a);

    const updated = emitsOf(h.last.effects, 'player:updated');
    expect(updated[0]?.to).toEqual({ kind: 'roomExcept', playerId: a });
    expect(snapshotsOf(h.last.effects).map((s) => s.playerId)).toEqual([a]);
  });

  it('la misma sesión ya conectada cierra el socket viejo e ignora su disconnect', () => {
    const h = createHarness();
    const a = h.join('Ana', { connId: 'viejo' });
    h.join('Beto');
    const again = h.dispatch({
      type: 'join',
      sessionId: 'secret-Ana',
      name: 'Ana',
      connId: 'nuevo',
    });
    expect(again.playerId).toBe(a);
    expect(again.effects).toContainEqual({ type: 'disconnectConn', connId: 'viejo' });
    expect(emitsOf(again.effects, 'player:updated')).toHaveLength(0);
    expect(snapshotsOf(again.effects)).toHaveLength(1);

    const stale = h.dispatch({ type: 'disconnect', playerId: a, connId: 'viejo' });
    expect(stale.error).toBeUndefined();
    expect(stale.effects).toEqual([]);
    expect(h.state.players[0]).toMatchObject({ connected: true, connId: 'nuevo' });
  });

  it('un disconnect de un jugador ya desconectado no hace nada', () => {
    const h = createHarness();
    const a = h.join('Ana', { connId: 'c1' });
    h.join('Beto');
    h.dispatch({ type: 'disconnect', playerId: a, connId: 'c1' });
    const second = h.dispatch({ type: 'disconnect', playerId: a, connId: 'c1' });
    expect(second.effects).toEqual([]);
    expect(h.state.players[0]?.disconnectedAt).toBe(h.now);
  });

  it('la reconexión tras la gracia entra como jugador nuevo', () => {
    const h = createHarness();
    const [a] = h.joinAll('Ana', 'Beto');
    h.state.players[0]!.score = 5;
    h.disconnect(a!);
    h.advanceBy(GRACE);
    expect(h.state.players.map((p) => p.name)).toEqual(['Beto']);

    const again = h.join('Ana');
    expect(again).not.toBe(a);
    expect(h.state.players.map((p) => p.name)).toEqual(['Beto', 'Ana']);
    expect(h.state.players[1]?.score).toBe(0);
  });

  it('el sessionId no aparece en ningún efecto', () => {
    const h = createHarness();
    const [a] = h.joinAll('Ana', 'Beto', 'Caro');
    h.join('Ana', { connId: 'otra-pestana' });
    h.dispatch({ type: 'disconnect', playerId: a!, connId: 'otra-pestana' });
    h.join('Ana');
    h.dispatch({ type: 'start', playerId: a! });
    const dump = JSON.stringify(h.effects);
    expect(dump).not.toContain('secret-');
    expect(dump).not.toContain('sessionId');
  });
});

describe('anfitrión y abandono', () => {
  it('el rol pasa al conectado más antiguo al borrarse el anfitrión', () => {
    const h = createHarness();
    const [a, b, c] = h.joinAll('Ana', 'Beto', 'Caro');
    h.disconnect(b!);
    h.dispatch({ type: 'leave', playerId: a! });
    expect(h.state.hostId).toBe(c);
    const updated = emitsOf(h.last.effects, 'player:updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]?.payload).toMatchObject({ id: c, isHost: true });
  });

  it('si no queda nadie conectado, el rol pasa al más antiguo', () => {
    const h = createHarness();
    const [a, b, c] = h.joinAll('Ana', 'Beto', 'Caro');
    h.disconnect(b!);
    h.disconnect(c!);
    h.dispatch({ type: 'leave', playerId: a! });
    expect(h.state.hostId).toBe(b);
  });

  it('desconectarse no transfiere el anfitrión', () => {
    const h = createHarness();
    const [a] = h.joinAll('Ana', 'Beto');
    h.disconnect(a!);
    expect(h.state.hostId).toBe(a);
    const updated = emitsOf(h.last.effects, 'player:updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]?.payload).toMatchObject({ id: a, connected: false, isHost: true });
  });

  it('leave de alguien que no existe da not_in_room', () => {
    const h = createHarness();
    h.join('Ana');
    expect(h.dispatch({ type: 'leave', playerId: 'nadie' }).error).toBe('not_in_room');
  });

  it('la gracia vencida borra al jugador y emite player:left', () => {
    const h = createHarness();
    const [, b] = h.joinAll('Ana', 'Beto', 'Caro');
    h.disconnect(b!);
    const mark = h.effects.length;
    h.advanceBy(GRACE - 1);
    expect(h.state.players).toHaveLength(3);
    h.advanceBy(1);
    expect(h.state.players.map((p) => p.name)).toEqual(['Ana', 'Caro']);
    const left = emitsOf(h.since(mark), 'player:left');
    expect(left).toHaveLength(1);
    expect(left[0]?.payload).toMatchObject({ id: b, name: 'Beto' });
  });

  it('quedar con un jugador a mitad de partida vuelve a LOBBY con snapshot y puntajes', () => {
    const h = startedGame(['Ana', 'Beto']);
    h.state.players[1]!.score = 12;
    const mark = h.effects.length;
    h.dispatch({ type: 'leave', playerId: h.idAt(0) });
    const fx = h.since(mark);
    expect(h.state.phase).toBe('LOBBY');
    expect(h.state.turn).toBeNull();
    expect(h.state.round).toBe(0);
    expect(h.state.deadline).toBeNull();
    expect(fx).toContainEqual({ type: 'strokes:reset' });
    expect(snapshotsOf(fx).map((s) => s.playerId)).toEqual(['p2']);
    expect(snapshotsOf(fx)[0]?.snapshot.phase).toBe('LOBBY');
    expect(h.state.players[0]?.score).toBe(12);
  });

  it('una gracia vencida que deja menos de 2 presentes vuelve a LOBBY', () => {
    const h = startedGame(['Ana', 'Beto']);
    h.disconnect(h.idAt(1));
    expect(h.state.phase).not.toBe('LOBBY');
    h.advanceBy(GRACE);
    expect(h.state.phase).toBe('LOBBY');
  });

  it('los jugadores en gracia cuentan como presentes', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro']);
    h.disconnect(h.idAt(2));
    h.dispatch({ type: 'leave', playerId: h.idAt(1) });
    expect(h.state.phase).not.toBe('LOBBY');
    expect(h.state.players).toHaveLength(2);
  });

  it('leave del dibujante en DRAWING con 3 jugadores termina el turno con drawer_left', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    const drawer = h.state.turn!.drawerId;
    h.say(h.idAt(1), 'huemul');
    h.dispatch({ type: 'leave', playerId: drawer });
    expect(h.state.phase).toBe('TURN_END');
    const [end] = emitsOf(h.last.effects, 'turn:end');
    expect(end?.payload.reason).toBe('drawer_left');
    expect(Object.values(end?.payload.gains ?? {}).every((g) => g === 0)).toBe(true);
    expect(emitsOf(h.last.effects, 'player:left')).toHaveLength(1);
  });

  it('leave de un adivinador en DRAWING revisa si ya acertaron todos', () => {
    const h = drawingGame(['Ana', 'Beto', 'Caro']);
    h.say(h.idAt(1), 'huemul');
    expect(h.state.phase).toBe('DRAWING');
    h.dispatch({ type: 'leave', playerId: h.idAt(2) });
    expect(h.state.phase).toBe('TURN_END');
    expect(h.state.turn?.result?.reason).toBe('all_guessed');
  });

  it('leave del dibujante en CHOOSING pasa al siguiente turno', () => {
    const h = startedGame(['Ana', 'Beto', 'Caro']);
    h.dispatch({ type: 'leave', playerId: h.idAt(0) });
    expect(h.state.phase).toBe('CHOOSING');
    expect(h.state.turn?.drawerId).toBe('p2');
  });
});
