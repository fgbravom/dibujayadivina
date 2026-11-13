// Configuración por defecto del motor, armada con las constantes de @dya/shared.

import {
  AFTER_FIRST_GUESS_SECONDS,
  CHOOSE_SECONDS,
  HINT_TIME_FRACTIONS,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  RECONNECT_GRACE_SECONDS,
  TURN_END_SECONDS,
  WORD_OPTIONS_COUNT,
} from '@dya/shared';
import type { EngineConfig } from './types.js';

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  minPlayers: MIN_PLAYERS_TO_START,
  maxPlayers: MAX_PLAYERS,
  optionsCount: WORD_OPTIONS_COUNT,
  chooseMs: CHOOSE_SECONDS * 1000,
  shortenToMs: AFTER_FIRST_GUESS_SECONDS * 1000,
  turnEndMs: TURN_END_SECONDS * 1000,
  graceMs: RECONNECT_GRACE_SECONDS * 1000,
  hintFractions: HINT_TIME_FRACTIONS,
};
