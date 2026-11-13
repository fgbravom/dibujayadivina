// Jugadores: entrada y reconexión, desconexión, borrado y anfitrión
// (docs/motor-reglas.md secciones 5 y 6).

import { NICKNAME_MAX_LENGTH, normalizeGuess } from '@dya/shared';
import { emit, getPlayer, toRoom, toRoomExcept } from './env.js';
import type { Env, Outcome } from './env.js';
import { buildSnapshot, toPlayer } from './snapshot.js';
import { checkAllGuessed, endTurn, startNextTurn, toLobby } from './turns.js';
import type { EnginePlayer, PlayerId } from './types.js';

/** Si el nombre ya existe (comparado con `normalizeGuess`), agrega ` 2`, ` 3`... sin pasar el largo máximo. */
export function uniqueName(name: string, players: readonly EnginePlayer[]): string {
  const taken = new Set(players.map((p) => normalizeGuess(p.name)));
  if (!taken.has(normalizeGuess(name))) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = name.slice(0, NICKNAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
    if (!taken.has(normalizeGuess(candidate))) return candidate;
  }
}

/** El rol pasa al conectado más antiguo; si no hay, al más antiguo. */
export function transferHost(env: Env): void {
  const s = env.state;
  const next = s.players.find((p) => p.connected) ?? s.players[0];
  s.hostId = next?.id ?? null;
  if (next) emit(env, toRoom, 'player:updated', toPlayer(s, next));
}

export function handleJoin(
  env: Env,
  action: { sessionId: string; name: string; connId: string },
): Outcome {
  const s = env.state;
  const existing = s.players.find((p) => p.sessionId === action.sessionId);

  if (existing) {
    if (existing.connected && existing.connId !== null && existing.connId !== action.connId) {
      env.fx.push({ type: 'disconnectConn', connId: existing.connId });
    }
    const wasConnected = existing.connected;
    existing.connected = true;
    existing.connId = action.connId;
    existing.disconnectedAt = null;
    if (!wasConnected)
      emit(env, toRoomExcept(existing.id), 'player:updated', toPlayer(s, existing));
    env.fx.push({
      type: 'snapshot',
      playerId: existing.id,
      snapshot: buildSnapshot(s, existing.id, env.ctx.now),
    });
    return { playerId: existing.id };
  }

  if (s.players.length >= s.config.maxPlayers) return { error: 'room_full' };

  const player: EnginePlayer = {
    id: env.ctx.newId(),
    sessionId: action.sessionId,
    name: uniqueName(action.name, s.players),
    score: 0,
    connected: true,
    connId: action.connId,
    disconnectedAt: null,
  };
  s.players.push(player);
  if (s.hostId === null) s.hostId = player.id;
  emit(env, toRoomExcept(player.id), 'player:joined', toPlayer(s, player));
  env.fx.push({
    type: 'snapshot',
    playerId: player.id,
    snapshot: buildSnapshot(s, player.id, env.ctx.now),
  });
  return { playerId: player.id };
}

export function handleDisconnect(env: Env, playerId: PlayerId, connId: string): Outcome {
  const s = env.state;
  const player = getPlayer(s, playerId);
  if (!player || !player.connected || player.connId !== connId) return {};

  player.connected = false;
  player.connId = null;
  player.disconnectedAt = env.ctx.now;
  emit(env, toRoom, 'player:updated', toPlayer(s, player));
  afterPresenceLoss(env, playerId);
  return {};
}

/** Un jugador dejó de estar activo (caído o borrado): si era el dibujante o frena el turno, reacciona. */
function afterPresenceLoss(env: Env, playerId: PlayerId): void {
  const s = env.state;
  if (s.turn?.drawerId === playerId) {
    if (s.phase === 'CHOOSING') startNextTurn(env);
    else if (s.phase === 'DRAWING') endTurn(env, 'drawer_left');
  } else if (s.phase === 'DRAWING') {
    checkAllGuessed(env);
  }
}

export function removePlayer(env: Env, playerId: PlayerId): void {
  const s = env.state;
  const index = s.players.findIndex((p) => p.id === playerId);
  const player = s.players[index];
  if (!player) return;

  const view = toPlayer(s, player);
  s.players.splice(index, 1);
  s.drawnThisRound = s.drawnThisRound.filter((id) => id !== playerId);
  emit(env, toRoom, 'player:left', view);

  if (s.hostId === playerId) transferHost(env);

  const inTurnPhase = s.phase === 'CHOOSING' || s.phase === 'DRAWING' || s.phase === 'TURN_END';
  if (inTurnPhase && s.players.length < s.config.minPlayers) {
    toLobby(env);
    return;
  }
  afterPresenceLoss(env, playerId);
}
