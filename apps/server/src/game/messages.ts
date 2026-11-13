// Mensajes y intentos (docs/motor-reglas.md sección 6, "Mensajes en DRAWING").

import { normalizeGuess } from '@dya/shared';
import { emit, getPlayer, toMany, toOne, toRoom } from './env.js';
import type { Env, Outcome } from './env.js';
import { levenshtein } from './levenshtein.js';
import { guesserPoints } from './scoring.js';
import { checkAllGuessed } from './turns.js';
import type { PlayerId } from './types.js';

export type GuessKind = 'correct' | 'contains' | 'close' | 'plain';

/** Clasifica un intento ya normalizado contra las respuestas aceptadas. */
export function classifyGuess(normalized: string, answers: readonly string[]): GuessKind {
  if (normalized === '') return 'plain';
  if (answers.includes(normalized)) return 'correct';
  const padded = ` ${normalized} `;
  if (answers.some((a) => padded.includes(` ${a} `))) return 'contains';
  if (answers.some((a) => levenshtein(normalized, a, 1) === 1)) return 'close';
  return 'plain';
}

export function handleMessage(env: Env, playerId: PlayerId, rawText: string): Outcome {
  const s = env.state;
  if (!getPlayer(s, playerId)) return { error: 'not_in_room' };
  const text = rawText.trim();
  if (text === '') return {};

  const turn = s.turn;
  if (s.phase !== 'DRAWING' || !turn) {
    emit(env, toRoom, 'message:new', { playerId, text, channel: 'all' });
    return {};
  }

  const alreadyKnows =
    turn.drawerId === playerId || turn.guesses.some((g) => g.playerId === playerId);
  if (alreadyKnows) {
    const knowers = [turn.drawerId, ...turn.guesses.map((g) => g.playerId)];
    emit(env, toMany(knowers), 'message:new', { playerId, text, channel: 'guessed' });
    return {};
  }

  switch (classifyGuess(normalizeGuess(text), turn.answers)) {
    case 'correct': {
      turn.guesses.push({ playerId, points: guesserPoints(turn.guesses.length) });
      emit(env, toRoom, 'guess:correct', { playerId });
      emit(env, toOne(playerId), 'turn:word', { word: turn.word?.text ?? '' });
      checkAllGuessed(env);
      if (s.phase === 'DRAWING' && turn.guesses.length === 1) shortenTime(env);
      break;
    }
    case 'contains':
      emit(env, toOne(playerId), 'message:new', { playerId, text, channel: 'all' });
      break;
    case 'close':
      emit(env, toRoom, 'message:new', { playerId, text, channel: 'all' });
      emit(env, toOne(playerId), 'guess:close', undefined);
      break;
    case 'plain':
      emit(env, toRoom, 'message:new', { playerId, text, channel: 'all' });
      break;
  }
  return {};
}

/** Primer acierto: el tiempo restante baja a `shortenToMs` si quedaba más. */
function shortenTime(env: Env): void {
  const s = env.state;
  const turn = s.turn;
  if (!turn || s.deadline === null) return;
  if (s.deadline - env.ctx.now <= s.config.shortenToMs) return;
  s.deadline = env.ctx.now + s.config.shortenToMs;
  const deadline = s.deadline;
  turn.pendingHints = turn.pendingHints.filter((t) => t < deadline);
  emit(env, toRoom, 'turn:timer', { endsAt: deadline });
}
