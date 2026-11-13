// Ciclo de turnos: elegir palabra, dibujar, pistas, fin de turno y fin de partida
// (docs/motor-reglas.md sección 5).

import { getMaskableIndices, maskWord, maxRevealCount, normalizeGuess } from '@dya/shared';
import type { TurnEndReason } from '@dya/shared';
import { emit, getPlayer, toOne, toRoom } from './env.js';
import type { Env, Outcome } from './env.js';
import { computeGains, ranking } from './scoring.js';
import { buildSnapshot } from './snapshot.js';
import type { PlayerId, WordEntry } from './types.js';

function drawMs(env: Env): number {
  const { config, settings } = env.state;
  return config.drawMsOverride ?? settings.drawSeconds * 1000;
}

/** Instantes absolutos de las pistas: `inicio + floor(drawMs * fracción)`, una por letra revelable. */
function hintTimes(env: Env, word: string, start: number, totalMs: number): number[] {
  const { hintFractions } = env.state.config;
  const count = Math.min(hintFractions.length, maxRevealCount(word));
  return hintFractions.slice(0, count).map((f) => start + Math.floor(totalMs * f));
}

export function startNextTurn(env: Env): void {
  const s = env.state;
  const pick = (drawn: readonly PlayerId[]) =>
    s.players.find((p) => p.connected && !drawn.includes(p.id));

  let candidate = pick(s.drawnThisRound);
  if (!candidate && s.round < s.settings.rounds) {
    candidate = pick([]);
    if (candidate) {
      s.round += 1;
      s.drawnThisRound = [];
    }
  }
  if (!candidate) {
    endGame(env);
    return;
  }

  const options = env.ctx.pickWords(s.usedWords, s.config.optionsCount);
  if (options.length === 0) throw new Error('pickWords no devolvió opciones');
  s.usedWords.push(...options.map((o) => o.text));
  s.drawnThisRound.push(candidate.id);
  s.turn = {
    drawerId: candidate.id,
    options,
    word: null,
    answers: [],
    revealed: [],
    pendingHints: [],
    guesses: [],
    result: null,
  };
  s.phase = 'CHOOSING';
  s.deadline = env.ctx.now + s.config.chooseMs;

  env.fx.push({ type: 'strokes:reset' });
  emit(env, toRoom, 'turn:choosing', { drawerId: candidate.id, endsAt: s.deadline });
  emit(env, toOne(candidate.id), 'turn:options', { words: options.map((o) => o.text) });
}

export function beginDrawing(env: Env, entry: WordEntry): void {
  const s = env.state;
  const turn = s.turn;
  if (!turn) throw new Error('beginDrawing sin turno');
  const now = env.ctx.now;
  const total = drawMs(env);

  const answers = [entry.text, ...(entry.accept ?? [])].map(normalizeGuess).filter((a) => a !== '');
  turn.word = entry;
  turn.answers = [...new Set(answers)];
  turn.revealed = [];
  turn.pendingHints = hintTimes(env, entry.text, now, total);
  s.phase = 'DRAWING';
  s.deadline = now + total;

  emit(env, toRoom, 'turn:start', {
    drawerId: turn.drawerId,
    mask: maskWord(entry.text),
    endsAt: s.deadline,
    round: s.round,
    totalRounds: s.settings.rounds,
  });
  emit(env, toOne(turn.drawerId), 'turn:word', { word: entry.text });
}

/** Revela al azar una letra aún oculta y avisa la nueva máscara a toda la sala. */
export function revealHint(env: Env): void {
  const turn = env.state.turn;
  if (!turn?.word) return;
  const hidden = getMaskableIndices(turn.word.text).filter((i) => !turn.revealed.includes(i));
  if (hidden.length === 0) return;
  const index = hidden[Math.floor(env.ctx.rng() * hidden.length)];
  if (index === undefined) return;
  turn.revealed.push(index);
  emit(env, toRoom, 'turn:hint', { mask: maskWord(turn.word.text, turn.revealed) });
}

export function endTurn(env: Env, reason: TurnEndReason): void {
  const s = env.state;
  const turn = s.turn;
  if (!turn?.word) throw new Error('endTurn sin palabra');

  const gains = computeGains(turn, s.players, reason);
  const scores: Record<string, number> = {};
  for (const p of s.players) {
    p.score += gains[p.id] ?? 0;
    scores[p.id] = p.score;
  }
  turn.pendingHints = [];
  turn.result = { word: turn.word.text, gains, scores, reason };
  s.phase = 'TURN_END';
  s.deadline = env.ctx.now + s.config.turnEndMs;
  emit(env, toRoom, 'turn:end', turn.result);
}

export function endGame(env: Env): void {
  const s = env.state;
  s.turn = null;
  s.phase = 'GAME_END';
  s.deadline = null;
  s.ranking = ranking(s.players);
  emit(env, toRoom, 'game:end', { ranking: s.ranking });
}

export function toLobby(env: Env): void {
  const s = env.state;
  s.phase = 'LOBBY';
  s.round = 0;
  s.drawnThisRound = [];
  s.turn = null;
  s.deadline = null;
  s.ranking = null;
  env.fx.push({ type: 'strokes:reset' });
  for (const p of s.players) {
    if (p.connected) {
      env.fx.push({
        type: 'snapshot',
        playerId: p.id,
        snapshot: buildSnapshot(s, p.id, env.ctx.now),
      });
    }
  }
}

/** En DRAWING, termina el turno si hay al menos un acierto y todo conectado que no dibuja ya acertó. */
export function checkAllGuessed(env: Env): void {
  const s = env.state;
  const turn = s.turn;
  if (s.phase !== 'DRAWING' || !turn || turn.guesses.length === 0) return;
  const pending = s.players.some(
    (p) => p.connected && p.id !== turn.drawerId && !turn.guesses.some((g) => g.playerId === p.id),
  );
  if (!pending) endTurn(env, 'all_guessed');
}

export function handleChooseWord(env: Env, playerId: PlayerId, index: number): Outcome {
  const s = env.state;
  if (!getPlayer(s, playerId)) return { error: 'not_in_room' };
  if (s.phase !== 'CHOOSING' || !s.turn) return { error: 'wrong_phase' };
  if (s.turn.drawerId !== playerId) return { error: 'not_drawer' };
  const entry = Number.isInteger(index) ? s.turn.options[index] : undefined;
  if (!entry) return { error: 'invalid_payload' };
  beginDrawing(env, entry);
  return {};
}
