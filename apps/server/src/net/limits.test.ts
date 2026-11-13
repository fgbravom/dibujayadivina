// Pruebas de red de los topes de abuso: inactividad, IP, frecuencia por jugador y origen.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MessageNewPayload,
  RoomState,
  Stroke,
  SystemErrorPayload,
  TurnChoosingPayload,
  TurnOptionsPayload,
  TurnStartPayload,
  TurnWordPayload,
} from '@dya/shared';
import { TestClient, closeAll, connect, createLobby, startServer } from './testing.js';
import type { Lobby } from './testing.js';

afterEach(closeAll);

const stroke = (id: string): Stroke => ({
  id,
  color: '#000000',
  size: 8,
  tool: 'brush',
  points: [10, 10, 20, 20],
});

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera a que el servidor haya procesado todo lo anterior de este cliente. */
async function sync(client: TestClient, marker: string): Promise<void> {
  client.emit('message:send', { text: marker });
  await client.waitFor<MessageNewPayload>('message:new', (m) => m.text === marker);
}

/** Inicia la partida y devuelve al dibujante con el turno ya en DRAWING. */
async function startDrawing(lobby: Lobby): Promise<TestClient> {
  lobby.players[0]?.emit('game:start');
  const choosing = await Promise.all(
    lobby.players.map((p) => p.waitFor<TurnChoosingPayload>('turn:choosing')),
  );
  const drawer = lobby.players.find((p) => p.playerId === choosing[0]?.drawerId);
  if (!drawer) throw new Error('sin dibujante');
  await drawer.waitFor<TurnOptionsPayload>('turn:options');
  drawer.emit('word:choose', { index: 0 });
  await drawer.waitFor<TurnWordPayload>('turn:word');
  await Promise.all(lobby.players.map((p) => p.waitFor<TurnStartPayload>('turn:start')));
  return drawer;
}

/** Resultado de intentar conectar: el mensaje del rechazo o "connected". */
function tryConnect(server: { url: string }, headers: Record<string, string> = {}) {
  return new Promise<string>((resolve) => {
    const client = new TestClient(server.url, headers);
    client.socket.once('connect', () => resolve('connected'));
    client.socket.once('connect_error', (e) => resolve(e.message));
  });
}

describe('salas abandonadas', () => {
  it('cierra una sala en LOBBY sin acciones, avisa con room_not_found y limpia la sesión', async () => {
    const server = await startServer({ roomIdleMs: 250 });
    const lobby = await createLobby(server, 2);
    const [host, guest] = lobby.players;
    if (!host || !guest) throw new Error('faltan jugadores');

    const isGone = (e: SystemErrorPayload) => e.code === 'room_not_found';
    await host.waitFor<SystemErrorPayload>('system:error', isGone, 2000);
    await guest.waitFor<SystemErrorPayload>('system:error', isGone, 2000);
    expect(server.roomCount()).toBe(0);

    // La sesión quedó limpia: el socket ya no pertenece a ninguna sala.
    host.emit('message:send', { text: 'hola' });
    await host.waitFor<SystemErrorPayload>('system:error', (e) => e.code === 'not_in_room');
  });

  it('la actividad de los jugadores aplaza el cierre', async () => {
    const server = await startServer({ roomIdleMs: 400 });
    const lobby = await createLobby(server, 2);
    const [host] = lobby.players;
    if (!host) throw new Error('falta el anfitrión');
    for (let i = 0; i < 5; i++) {
      await wait(150);
      host.emit('room:settings', { rounds: 2 + (i % 2), drawSeconds: 60 }); // una acción de control
    }
    await sync(host, 'sigo-aqui');
    expect(server.roomCount()).toBe(1); // más de 750 ms en total, con un plazo de 400
    await host.waitFor<SystemErrorPayload>(
      'system:error',
      (e) => e.code === 'room_not_found',
      2000,
    );
    expect(server.roomCount()).toBe(0);
  });

  it('no cierra una sala con un turno en marcha', async () => {
    const server = await startServer({ roomIdleMs: 150, drawMs: 5000 });
    const lobby = await createLobby(server, 2);
    await startDrawing(lobby);
    await wait(500);
    expect(server.roomCount()).toBe(1);
    expect(lobby.players[0]?.received('system:error')).toHaveLength(0);
  });
});

describe('topes por IP', () => {
  it('rechaza la conexión que excede el máximo de conexiones simultáneas', async () => {
    const server = await startServer({ maxConnectionsPerIp: 2 });
    await connect(server);
    const second = await connect(server);
    expect(await tryConnect(server)).toBe('too_many_connections');
    // Al cerrar una se libera un cupo.
    second.close();
    await vi.waitFor(async () => expect(await tryConnect(server)).toBe('connected'), {
      timeout: 3000,
      interval: 50,
    });
  });

  it('sin cabecera configurada no se confía en ninguna cabecera de IP', async () => {
    const server = await startServer({ maxConnectionsPerIp: 1 });
    await connect(server, { 'x-test-ip': '1.1.1.1' });
    expect(await tryConnect(server, { 'x-test-ip': '2.2.2.2' })).toBe('too_many_connections');
  });

  it('con cabecera configurada cuenta por la IP que trae', async () => {
    const server = await startServer({ maxConnectionsPerIp: 1, clientIpHeader: 'X-Test-IP' });
    await connect(server, { 'x-test-ip': '1.1.1.1' });
    await connect(server, { 'x-test-ip': '2.2.2.2' });
    expect(await tryConnect(server, { 'x-test-ip': '1.1.1.1' })).toBe('too_many_connections');
  });

  it('responde rate_limited a room:create si la IP creó demasiadas salas por minuto', async () => {
    const server = await startServer({ maxRoomsPerIpPerMinute: 2, clientIpHeader: 'x-test-ip' });
    const create = async (index: number, ip: string) => {
      const client = await connect(server, { 'x-test-ip': ip });
      return client.ack('room:create', { name: 'Ana', sessionId: `sesion-de-ip-${index}` });
    };
    expect((await create(0, '1.1.1.1')).ok).toBe(true);
    expect((await create(1, '1.1.1.1')).ok).toBe(true);
    expect(await create(2, '1.1.1.1')).toEqual({ ok: false, error: 'rate_limited' });
    expect((await create(3, '2.2.2.2')).ok).toBe(true); // otra IP
    expect(server.roomCount()).toBe(3);
  });
});

describe('frecuencia de entrada y por jugador', () => {
  it('room:join y room:create comparten una cubeta de 3 en ráfaga, separada de la de control', async () => {
    const server = await startServer();
    const [host] = (await createLobby(server, 1)).players; // el create gastó 1 ficha
    if (!host) throw new Error('falta el anfitrión');
    const join = () =>
      host.ack('room:join', { code: 'ZZZZ', name: 'Ana', sessionId: 'sesion-de-prueba-9' });
    expect(await join()).toEqual({ ok: false, error: 'room_not_found' });
    expect(await join()).toEqual({ ok: false, error: 'room_not_found' });
    expect(await join()).toEqual({ ok: false, error: 'rate_limited' });
    expect(await host.ack('room:create', { name: 'Ana', sessionId: 'sesion-de-prueba-9' })).toEqual(
      { ok: false, error: 'rate_limited' },
    );

    // Los eventos de control siguen funcionando.
    host.emit('room:settings', { rounds: 5, drawSeconds: 60 });
    await host.waitFor<RoomState>('room:state', (s) => s.settings.rounds === 5);
  });

  it('cambiar de socket con la misma sesión no rellena la cubeta de texto', async () => {
    const server = await startServer();
    const lobby = await createLobby(server, 2);
    const [first] = lobby.players;
    if (!first) throw new Error('falta el jugador');
    for (let i = 0; i < 8; i++) first.emit('message:send', { text: `spam ${i}` });
    await first.waitFor<SystemErrorPayload>('system:error', (e) => e.code === 'rate_limited');

    const second = await connect(server);
    const res = await second.ack('room:join', {
      code: lobby.code,
      name: lobby.names[0],
      sessionId: lobby.sessionIds[0],
    });
    expect(res.ok).toBe(true);
    // Tres seguidos caben en una cubeta recién llena, no en una que solo se recargó un instante.
    for (let i = 0; i < 3; i++) second.emit('message:send', { text: `ya ${i}?` });
    const err = await second.waitFor<SystemErrorPayload>('system:error');
    expect(err.code).toBe('rate_limited');
  });

  it('cambiar de socket tampoco rellena la cubeta de trazos del dibujante', async () => {
    const server = await startServer({ drawMs: 5000 });
    const lobby = await createLobby(server, 2);
    const drawer = await startDrawing(lobby);
    for (let i = 0; i < 60; i++) drawer.emit('stroke:start', stroke(`q${i}`));
    await drawer.waitFor<SystemErrorPayload>('system:error', (e) => e.code === 'rate_limited');

    const index = lobby.players.indexOf(drawer);
    const second = await connect(server);
    const res = await second.ack('room:join', {
      code: lobby.code,
      name: lobby.names[index],
      sessionId: lobby.sessionIds[index],
    });
    expect(res.ok).toBe(true);
    // Una ráfaga que una cubeta recién llena (30) dejaría pasar entera, pero no una vacía que
    // solo se recargó durante el cambio de socket: así la prueba no depende de milisegundos.
    for (let i = 0; i < 25; i++) second.emit('stroke:start', stroke(`n${i}`));
    const err = await second.waitFor<SystemErrorPayload>('system:error');
    expect(err.code).toBe('rate_limited');
  });
});

describe('origen de las conexiones', () => {
  it('con checkOrigin rechaza un Origin con otro host y acepta el propio o la ausencia de Origin', async () => {
    const server = await startServer({ checkOrigin: true });
    expect(await tryConnect(server, { origin: 'https://evil.example' })).not.toBe('connected');
    expect(await tryConnect(server, { origin: 'null' })).not.toBe('connected');
    expect(await tryConnect(server, { origin: server.url })).toBe('connected');
    expect(await tryConnect(server, {})).toBe('connected');
  });

  it('acepta los orígenes de allowedOrigins aunque el host no coincida', async () => {
    const server = await startServer({
      checkOrigin: true,
      allowedOrigins: ['https://juego.example.com/'],
    });
    expect(await tryConnect(server, { origin: 'https://juego.example.com' })).toBe('connected');
    expect(await tryConnect(server, { origin: 'https://otro.example.com' })).not.toBe('connected');
  });

  it('sin checkOrigin (fuera de producción) no filtra', async () => {
    const server = await startServer();
    expect(await tryConnect(server, { origin: 'https://evil.example' })).toBe('connected');
  });
});
