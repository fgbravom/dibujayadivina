import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GameEndPayload,
  MessageNewPayload,
  Player,
  RoomState,
  Stroke,
  SystemErrorPayload,
  TurnChoosingPayload,
  TurnEndPayload,
  TurnOptionsPayload,
  TurnStartPayload,
  TurnWordPayload,
} from '@dya/shared';
import { TEST_WORDS, closeAll, connect, createLobby, startServer } from './testing.js';
import type { Lobby, TestClient } from './testing.js';

afterEach(closeAll);

const stroke = (id: string, points: number[] = [10, 10, 20, 20]): Stroke => ({
  id,
  color: '#000000',
  size: 8,
  tool: 'brush',
  points,
});

/** Espera a que el servidor haya procesado todo lo anterior de este cliente (un mensaje de ida y vuelta). */
async function sync(client: TestClient, marker: string): Promise<void> {
  client.emit('message:send', { text: marker });
  await client.waitFor<MessageNewPayload>('message:new', (m) => m.text === marker);
}

function playerById(lobby: Lobby, id: string): TestClient {
  const found = lobby.players.find((p) => p.playerId === id);
  if (!found) throw new Error(`No hay jugador ${id}`);
  return found;
}

/** Inicia la partida y deja el turno actual con el dibujante ya dibujando. */
async function startDrawing(lobby: Lobby, chooseIndex = 0) {
  const [host] = lobby.players;
  host?.emit('game:start');
  return nextDrawing(lobby, chooseIndex);
}

async function nextDrawing(lobby: Lobby, chooseIndex = 0) {
  const choosing = await Promise.all(
    lobby.players.map((p) => p.waitFor<TurnChoosingPayload>('turn:choosing')),
  );
  const drawer = playerById(lobby, choosing[0]?.drawerId ?? '');
  const options = await drawer.waitFor<TurnOptionsPayload>('turn:options');
  drawer.emit('word:choose', { index: chooseIndex });
  const { word } = await drawer.waitFor<TurnWordPayload>('turn:word');
  expect(word).toBe(options.words[chooseIndex]);
  await Promise.all(lobby.players.map((p) => p.waitFor<TurnStartPayload>('turn:start')));
  const guessers = lobby.players.filter((p) => p !== drawer);
  return { drawer, guessers, word, options: options.words };
}

describe('partida completa', () => {
  it('juega 2 rondas de 3 jugadores hasta game:end sin filtrar la palabra', async () => {
    const server = await startServer({ drawMs: 700 });
    const lobby = await createLobby(server, 3);
    const [host] = lobby.players;
    if (!host) throw new Error('sin anfitrión');

    host.emit('room:settings', { rounds: 2, drawSeconds: 30 });
    await host.waitFor<RoomState>('room:state', (s) => s.settings.rounds === 2);
    host.emit('game:start');

    const turns: { drawerId: string; word: string; reason: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const choosing = await Promise.all(
        lobby.players.map((p) => p.waitFor<TurnChoosingPayload>('turn:choosing')),
      );
      const drawer = playerById(lobby, choosing[0]?.drawerId ?? '');
      const guessers = lobby.players.filter((p) => p !== drawer);
      const options = await drawer.waitFor<TurnOptionsPayload>('turn:options');
      const index = i % 3;
      drawer.emit('word:choose', { index });
      const { word } = await drawer.waitFor<TurnWordPayload>('turn:word');
      expect(word).toBe(options.words[index]);
      await Promise.all(lobby.players.map((p) => p.waitFor<TurnStartPayload>('turn:start')));

      // Turnos 0 y 3: aciertan todos; 1 y 4: nadie; 2 y 5: acierta solo uno.
      const scenario = i % 3;
      const guesserList = scenario === 0 ? guessers : scenario === 2 ? guessers.slice(0, 1) : [];
      for (const g of guesserList) g.emit('message:send', { text: word.toUpperCase() });
      // Quien acierta recibe la palabra; se consume para no confundirla con la de un turno propio.
      await Promise.all(guesserList.map((g) => g.waitFor<TurnWordPayload>('turn:word')));

      const ends = await Promise.all(
        lobby.players.map((p) => p.waitFor<TurnEndPayload>('turn:end', () => true, 5000)),
      );
      const end = ends[0];
      expect(end?.word).toBe(word);
      expect(end?.reason).toBe(scenario === 0 ? 'all_guessed' : 'time');
      turns.push({ drawerId: drawer.playerId, word, reason: end?.reason ?? '' });
    }

    const [firstEnd] = await Promise.all(
      lobby.players.map((p) => p.waitFor<GameEndPayload>('game:end', () => true, 5000)),
    );
    expect(firstEnd?.ranking).toHaveLength(3);
    expect(firstEnd?.ranking.map((r) => r.rank)[0]).toBe(1);
    // Cada uno dibujó dos veces (una por ronda) y la suma de los turnos coincide con el ranking.
    for (const p of lobby.players) {
      expect(turns.filter((t) => t.drawerId === p.playerId)).toHaveLength(2);
    }
    const lastEnd = lobby.players[0]?.received<TurnEndPayload>('turn:end').at(-1);
    for (const entry of firstEnd?.ranking ?? []) {
      expect(entry.score).toBe(lastEnd?.scores[entry.playerId]);
    }

    // turn:options y turn:word solo llegan a quien corresponde.
    for (const p of lobby.players) {
      const ownTurns = turns.filter((t) => t.drawerId === p.playerId).length;
      expect(p.received('turn:options')).toHaveLength(ownTurns);
      let drawerNow = '';
      p.log.forEach((entry, idx) => {
        if (entry.event === 'turn:choosing')
          drawerNow = (entry.payload as TurnChoosingPayload).drawerId;
        if (entry.event !== 'turn:word') return;
        if (drawerNow === p.playerId) return;
        const before = p.log[idx - 1];
        expect(before?.event).toBe('guess:correct');
        expect((before?.payload as { playerId: string }).playerId).toBe(p.playerId);
      });
    }

    // La palabra no aparece en nada que reciba un adivinador antes de acertar o de turn:end.
    for (const p of lobby.players) {
      let turnIndex = -1;
      let word = '';
      let guarding = false;
      for (const entry of p.log) {
        if (entry.event === 'turn:choosing') {
          turnIndex++;
          word = turns[turnIndex]?.word ?? '';
          guarding = turns[turnIndex]?.drawerId !== p.playerId;
        } else if (entry.event === 'turn:end') {
          guarding = false;
        } else if (
          entry.event === 'guess:correct' &&
          (entry.payload as { playerId: string }).playerId === p.playerId
        ) {
          guarding = false;
        }
        if (guarding) {
          expect(JSON.stringify(entry.payload ?? null).toLowerCase()).not.toContain(word);
        }
      }
    }
  }, 30_000);
});

describe('trazos', () => {
  it('solo el dibujante dibuja; los trazos van a los demás y no vuelven a él', async () => {
    const server = await startServer({ drawMs: 5000 });
    const lobby = await createLobby(server, 3);
    const { drawer, guessers } = await startDrawing(lobby);
    const [g1, g2] = guessers;
    if (!g1 || !g2) throw new Error('faltan adivinadores');

    // Quien no dibuja no puede trazar ni deshacer ni limpiar.
    g1.emit('stroke:start', stroke('x1'));
    g1.emit('stroke:points', { id: 'x1', points: [1, 1] });
    g1.emit('canvas:undo');
    g1.emit('canvas:clear');
    for (let i = 0; i < 4; i++) {
      const err = await g1.waitFor<SystemErrorPayload>('system:error');
      expect(err.code).toBe('not_drawer');
    }
    await sync(g2, 'ping');
    expect(g2.received('stroke:start')).toHaveLength(0);
    expect(g2.received('canvas:undo')).toHaveLength(0);

    drawer.emit('stroke:start', stroke('s1'));
    drawer.emit('stroke:points', { id: 's1', points: [30, 30, 40, 40] });
    drawer.emit('stroke:points', { id: 'desconocido', points: [5, 5] });
    drawer.emit('stroke:end', { id: 's1' });
    drawer.emit('stroke:start', stroke('s2'));
    drawer.emit('canvas:undo');

    for (const g of [g1, g2]) {
      expect(await g.waitFor<Stroke>('stroke:start', (s) => s.id === 's1')).toEqual(stroke('s1'));
      expect(await g.waitFor('stroke:points')).toEqual({ id: 's1', points: [30, 30, 40, 40] });
      await g.waitFor('stroke:end');
      await g.waitFor('stroke:start', (s: Stroke) => s.id === 's2');
      await g.waitFor('canvas:undo');
      // El de id desconocido no se reenvía.
      expect(g.received('stroke:points')).toHaveLength(1);
    }

    // Nada de eso vuelve al dibujante: un mensaje propio llega después de cualquier trazo reenviado.
    await sync(drawer, 'listo');
    for (const event of ['stroke:start', 'stroke:points', 'stroke:end', 'canvas:undo']) {
      expect(drawer.received(event)).toHaveLength(0);
    }

    // Un nuevo jugador recibe el historial con el deshacer ya aplicado (solo queda s1).
    const late = await connect(server);
    const res = await late.ack('room:join', {
      code: lobby.code,
      name: 'Tarde',
      sessionId: 'sesion-tardia-1',
    });
    expect(res.ok).toBe(true);
    const state = await late.waitFor<RoomState>('room:state');
    expect(state.phase).toBe('DRAWING');
    expect(state.strokes.map((s) => s.id)).toEqual(['s1']);
    expect(state.strokes[0]?.points).toEqual([10, 10, 20, 20, 30, 30, 40, 40]);
    expect(state.word).toBeNull();
    expect(state.mask).not.toBeNull();
  });

  it('respeta el tope de trazos por turno', async () => {
    const server = await startServer({ drawMs: 5000, strokeLimits: { strokesPerTurn: 2 } });
    const lobby = await createLobby(server, 2);
    const { drawer } = await startDrawing(lobby);
    drawer.emit('stroke:start', stroke('a'));
    drawer.emit('stroke:start', stroke('b'));
    drawer.emit('stroke:start', stroke('c'));
    const err = await drawer.waitFor<SystemErrorPayload>('system:error');
    expect(err.code).toBe('too_many_strokes');
  });
});

describe('rellenos (bote de pintura)', () => {
  const fill = (id: string, color = '#e63946'): Stroke => ({
    id,
    color,
    size: 8,
    tool: 'fill',
    points: [100, 100],
  });

  it('se reenvía a los demás, ignora puntos sueltos y llega en room:state en su orden', async () => {
    const server = await startServer({ drawMs: 5000 });
    const lobby = await createLobby(server, 3);
    const { drawer, guessers } = await startDrawing(lobby);
    const [g1, g2] = guessers;
    if (!g1 || !g2) throw new Error('faltan adivinadores');

    drawer.emit('stroke:start', stroke('s1'));
    drawer.emit('stroke:end', { id: 's1' });
    drawer.emit('stroke:start', fill('f1'));
    // Puntos sobre el relleno: se descartan sin avisar ni reenviar.
    drawer.emit('stroke:points', { id: 'f1', points: [5, 5] });
    drawer.emit('stroke:end', { id: 'f1' });
    // Un relleno con más de un punto no pasa el esquema.
    drawer.emit('stroke:start', { ...fill('mal'), points: [1, 1, 2, 2] });
    const err = await drawer.waitFor<SystemErrorPayload>('system:error');
    expect(err.code).toBe('invalid_payload');
    drawer.emit('stroke:start', stroke('s2'));

    for (const g of [g1, g2]) {
      expect(await g.waitFor<Stroke>('stroke:start', (s) => s.id === 'f1')).toEqual(fill('f1'));
      await g.waitFor('stroke:end', (p: { id: string }) => p.id === 'f1');
      await g.waitFor<Stroke>('stroke:start', (s) => s.id === 's2');
      expect(g.received('stroke:points')).toHaveLength(0);
      expect(g.received<Stroke>('stroke:start').map((s) => s.id)).toEqual(['s1', 'f1', 's2']);
    }

    const late = await connect(server);
    const res = await late.ack('room:join', {
      code: lobby.code,
      name: 'Tarde',
      sessionId: 'sesion-tardia-2',
    });
    expect(res.ok).toBe(true);
    const state = await late.waitFor<RoomState>('room:state');
    expect(state.strokes.map((s) => `${s.id}:${s.tool}`)).toEqual([
      's1:brush',
      'f1:fill',
      's2:brush',
    ]);
    expect(state.strokes[1]?.points).toEqual([100, 100]);
  });

  it('respeta el tope de rellenos por turno y avisa al dibujante', async () => {
    const server = await startServer({ drawMs: 5000, strokeLimits: { fillsPerTurn: 2 } });
    const lobby = await createLobby(server, 2);
    const { drawer, guessers } = await startDrawing(lobby);
    const [guesser] = guessers;
    if (!guesser) throw new Error('falta un adivinador');
    drawer.emit('stroke:start', fill('a'));
    drawer.emit('stroke:start', fill('b'));
    drawer.emit('stroke:start', fill('c'));
    const err = await drawer.waitFor<SystemErrorPayload>('system:error');
    expect(err.code).toBe('too_many_strokes');
    // Un pincel sigue entrando, y el tercer relleno nunca se reenvió.
    drawer.emit('stroke:start', stroke('d'));
    await guesser.waitFor<Stroke>('stroke:start', (s) => s.id === 'd');
    expect(guesser.received<Stroke>('stroke:start').map((s) => s.id)).toEqual(['a', 'b', 'd']);
  });
});

describe('reconexión y sesiones', () => {
  it('quien se reconecta con la misma sesión recibe puntajes y trazos del turno', async () => {
    const server = await startServer({ drawMs: 5000 });
    const lobby = await createLobby(server, 3);
    const first = await startDrawing(lobby);
    // Turno 1: todos aciertan y se reparten puntos.
    for (const g of first.guessers) g.emit('message:send', { text: first.word });
    await Promise.all(first.guessers.map((g) => g.waitFor<TurnWordPayload>('turn:word')));
    await Promise.all(lobby.players.map((p) => p.waitFor<TurnEndPayload>('turn:end')));

    const second = await nextDrawing(lobby);
    second.drawer.emit('stroke:start', stroke('t2'));
    second.drawer.emit('stroke:end', { id: 't2' });
    const [observer, leaver] = second.guessers;
    if (!observer || !leaver) throw new Error('faltan adivinadores');
    await observer.waitFor('stroke:end');

    const index = lobby.players.indexOf(leaver);
    leaver.close();
    await observer.waitFor<Player>(
      'player:updated',
      (p) => p.id === leaver.playerId && !p.connected,
    );

    const back = await connect(server);
    const res = await back.ack('room:join', {
      code: lobby.code,
      name: lobby.names[index],
      sessionId: lobby.sessionIds[index],
    });
    expect(res).toEqual({ ok: true, code: lobby.code, playerId: leaver.playerId });
    const state = await back.waitFor<RoomState>('room:state');
    expect(state.selfId).toBe(leaver.playerId);
    expect(state.phase).toBe('DRAWING');
    expect(state.drawerId).toBe(second.drawer.playerId);
    expect(state.strokes.map((s) => s.id)).toEqual(['t2']);
    expect(state.players).toHaveLength(3);
    expect(state.players.some((p) => p.score > 0)).toBe(true);
    expect(state.players.every((p) => p.connected)).toBe(true);
    expect(state.word).toBeNull();
    expect(JSON.stringify(state)).not.toContain(lobby.sessionIds[index] ?? 'sin-sesion');
    await observer.waitFor<Player>(
      'player:updated',
      (p) => p.id === leaver.playerId && p.connected,
    );
  }, 15_000);

  it('entrar con la misma sesión desde otro socket cierra el anterior', async () => {
    const server = await startServer();
    const lobby = await createLobby(server, 3);
    const [first, other] = lobby.players;
    if (!first || !other) throw new Error('faltan jugadores');

    const second = await connect(server);
    const res = await second.ack('room:join', {
      code: lobby.code,
      name: lobby.names[0],
      sessionId: lobby.sessionIds[0],
    });
    expect(res).toEqual({ ok: true, code: lobby.code, playerId: first.playerId });
    expect(await first.waitFor('disconnect')).toBe('io server disconnect');
    const state = await second.waitFor<RoomState>('room:state');
    expect(state.selfId).toBe(first.playerId);
    expect(state.players.find((p) => p.id === first.playerId)?.connected).toBe(true);

    // El cierre del socket viejo no marcó al jugador como caído.
    await sync(other, 'sigue-ahi');
    expect(
      other.received<Player>('player:updated').filter((p) => p.id === first.playerId),
    ).toHaveLength(0);
    // Y el socket nuevo es el que manda.
    second.emit('message:send', { text: 'hola desde el nuevo' });
    await other.waitFor<MessageNewPayload>('message:new', (m) => m.text === 'hola desde el nuevo');
  });

  it('al entrar a otra sala se sale de la anterior', async () => {
    const server = await startServer();
    const lobby = await createLobby(server, 2);
    const [host, guest] = lobby.players;
    if (!host || !guest) throw new Error('faltan jugadores');

    const res = await guest.ack('room:create', { name: 'Beto', sessionId: 'otra-sesion-1' });
    expect(res.ok).toBe(true);
    const left = await host.waitFor<Player>('player:left');
    expect(left.id).toBe(guest.playerId);
    expect(server.roomCount()).toBe(2);
  });
});

describe('errores y límites', () => {
  it('responde room_not_found e invalid_payload por ack', async () => {
    const server = await startServer();
    const client = await connect(server);
    expect(
      await client.ack('room:join', { code: 'ZZZZ', name: 'Ana', sessionId: 'sesion-de-prueba-0' }),
    ).toEqual({ ok: false, error: 'room_not_found' });
    expect(
      await client.ack('room:join', { code: 'zz', name: 'Ana', sessionId: 'sesion-de-prueba-0' }),
    ).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await client.ack('room:create', { name: 'x', sessionId: 'sesion-de-prueba-0' })).toEqual(
      {
        ok: false,
        error: 'invalid_payload',
      },
    );
    // Otro socket: el primero ya gastó la ráfaga de entradas.
    const other = await connect(server);
    expect(await other.ack('room:create', 'hola')).toEqual({
      ok: false,
      error: 'invalid_payload',
    });
    expect(server.roomCount()).toBe(0);
  });

  it('valida los eventos sin acuse y exige estar en una sala', async () => {
    const server = await startServer();
    const stranger = await connect(server);
    stranger.emit('message:send', { text: 'hola' });
    expect((await stranger.waitFor<SystemErrorPayload>('system:error')).code).toBe('not_in_room');
    stranger.emit('game:start');
    expect((await stranger.waitFor<SystemErrorPayload>('system:error')).code).toBe('not_in_room');

    const lobby = await createLobby(server, 2);
    const [host, guest] = lobby.players;
    if (!host || !guest) throw new Error('faltan jugadores');
    host.emit('message:send', { text: 123 });
    expect((await host.waitFor<SystemErrorPayload>('system:error')).code).toBe('invalid_payload');
    host.emit('stroke:start', { id: 'x', color: 'rojo', size: 8, tool: 'brush', points: [1, 1] });
    expect((await host.waitFor<SystemErrorPayload>('system:error')).code).toBe('invalid_payload');
    host.emit('word:choose', { index: 7 });
    expect((await host.waitFor<SystemErrorPayload>('system:error')).code).toBe('invalid_payload');
    host.emit('game:start', { extra: true });
    expect((await host.waitFor<SystemErrorPayload>('system:error')).code).toBe('invalid_payload');

    // Reglas del motor: solo el anfitrión inicia y solo en su fase.
    guest.emit('game:start');
    expect((await guest.waitFor<SystemErrorPayload>('system:error')).code).toBe('not_host');
    guest.emit('word:choose', { index: 0 });
    expect((await guest.waitFor<SystemErrorPayload>('system:error')).code).toBe('wrong_phase');
  });

  it('descarta con rate_limited lo que excede los mensajes de texto por segundo', async () => {
    const server = await startServer();
    const lobby = await createLobby(server, 2);
    const [spammer, other] = lobby.players;
    if (!spammer || !other) throw new Error('faltan jugadores');
    for (let i = 0; i < 12; i++) spammer.emit('message:send', { text: `spam ${i}` });
    const err = await spammer.waitFor<SystemErrorPayload>('system:error');
    expect(err.code).toBe('rate_limited');
    await sync(other, 'fin-del-spam');
    const delivered = other
      .received<MessageNewPayload>('message:new')
      .filter((m) => m.text.startsWith('spam'));
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.length).toBeLessThan(12);
  });

  it('descarta con rate_limited los trazos por encima del límite', async () => {
    const server = await startServer({ drawMs: 5000 });
    const lobby = await createLobby(server, 2);
    const { drawer } = await startDrawing(lobby);
    for (let i = 0; i < 45; i++) drawer.emit('stroke:start', stroke(`r${i}`));
    const err = await drawer.waitFor<SystemErrorPayload>('system:error');
    expect(err.code).toBe('rate_limited');
  });

  it('limita las salas simultáneas', async () => {
    const server = await startServer({ maxRooms: 1 });
    const a = await connect(server);
    const b = await connect(server);
    expect((await a.ack('room:create', { name: 'Ana', sessionId: 'sesion-de-prueba-0' })).ok).toBe(
      true,
    );
    expect(await b.ack('room:create', { name: 'Beto', sessionId: 'sesion-de-prueba-1' })).toEqual({
      ok: false,
      error: 'room_full',
    });
  });
});

describe('ciclo de vida de la sala', () => {
  it('borra la sala al quedar sin jugadores, una vez vencida la gracia', async () => {
    const server = await startServer({ graceMs: 300 });
    const lobby = await createLobby(server, 3);
    expect(server.roomCount()).toBe(1);
    for (const p of lobby.players) p.close();

    await vi.waitFor(() => expect(server.roomCount()).toBe(0), { timeout: 3000, interval: 50 });
    const late = await connect(server);
    expect(
      await late.ack('room:join', {
        code: lobby.code,
        name: 'Ana',
        sessionId: lobby.sessionIds[0],
      }),
    ).toEqual({ ok: false, error: 'room_not_found' });
  });

  it('el dibujante que se cae termina el turno y los demás siguen', async () => {
    const server = await startServer({ drawMs: 5000 });
    const lobby = await createLobby(server, 3);
    const { drawer, guessers } = await startDrawing(lobby);
    drawer.close();
    const end = await guessers[0]?.waitFor<TurnEndPayload>('turn:end');
    expect(end?.reason).toBe('drawer_left');
    expect(Object.values(end?.gains ?? {}).every((g) => g === 0)).toBe(true);
  });
});

describe('palabra de prueba determinista', () => {
  it('ofrece las palabras de la lista en orden', async () => {
    const server = await startServer();
    const lobby = await createLobby(server, 2);
    const { options } = await startDrawing(lobby);
    expect(options).toEqual(TEST_WORDS.slice(0, 3));
  });
});
