// Catálogo de efectos de sonido, descrito solo con datos (notas, duración, forma de onda y
// envolvente). Nada aquí toca Web Audio: `engine.ts` lo interpreta. Para ajustar un sonido basta
// con cambiar números en este archivo. Todos los sonidos se sintetizan en el navegador.

/** Timbre de una nota: onda base más armónicos opcionales que le dan carácter (campanita, marimba). */
export type Timbre = {
  wave: OscillatorType;
  /** Armónicos extra: `ratio` multiplica la frecuencia; `vol` es relativo a la nota; `decay` acorta su caída. */
  partials?: readonly { ratio: number; vol: number; decay?: number }[];
  /** Filtro pasabajos opcional (Hz) para apagar el timbre. */
  lowpass?: number;
};

export type Note = {
  /** Frecuencia en Hz (usa `hz('E5')`). */
  freq: number;
  /** Si existe, la frecuencia se desliza hasta este valor a lo largo de la nota (pops, golpes). */
  to?: number;
  /** Segundos desde el inicio del efecto. */
  at: number;
  /** Duración total en segundos; el volumen cae de forma exponencial hasta apagarse al final. */
  dur: number;
  /** Volumen pico de la nota (0 a 1, antes del volumen general). */
  vol: number;
  timbre: Timbre;
  /** Subida inicial en segundos (por defecto 0,006: ataque casi instantáneo). */
  attack?: number;
  /** Segundos que se sostiene el volumen pico antes de empezar a caer. */
  hold?: number;
};

/** Ráfaga corta de ruido filtrado (para dar cuerpo a un golpe suave). */
export type NoiseBurst = {
  at: number;
  dur: number;
  vol: number;
  lowpass: number;
};

export type Effect = {
  notes: readonly Note[];
  noise?: readonly NoiseBurst[];
  /** Separación mínima entre dos disparos del mismo efecto, para que una ráfaga no suene a metralleta. */
  minGapMs?: number;
};

export const SOUND_IDS = [
  'guessOther',
  'guessSelf',
  'close',
  'yourTurn',
  'turnStart',
  'tick',
  'turnEnd',
  'turnEndEmpty',
  'gameEnd',
  'playerJoin',
  'playerLeave',
  'chat',
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Nombre de nota a frecuencia: `hz('A4')` = 440, `hz('F#5')`, `hz('Bb3')`. */
export function hz(name: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`Nota inválida: ${name}`);
  const [, letter = 'A', accidental = '', octave = '4'] = match;
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  const midi = 12 * (Number(octave) + 1) + (SEMITONES[letter] ?? 0) + offset;
  return 440 * 2 ** ((midi - 69) / 12);
}

// --- Timbres ----------------------------------------------------------------

/** Campanita: seno limpio con dos armónicos que cuelgan un poco más que la nota. */
const BELL: Timbre = {
  wave: 'sine',
  partials: [
    { ratio: 2, vol: 0.3, decay: 0.7 },
    { ratio: 3, vol: 0.12, decay: 0.4 },
  ],
};

/** Marimba: seno con un armónico agudo que se apaga rápido (el "toc" de la madera). */
const MARIMBA: Timbre = {
  wave: 'sine',
  partials: [{ ratio: 4, vol: 0.28, decay: 0.2 }],
};

/** Blip: triángulo, redondo y sin armónicos extra. */
const BLIP: Timbre = { wave: 'triangle' };

/** Seno puro, para pops y golpes. */
const SOFT: Timbre = { wave: 'sine' };

/** Marimba apagada (pasabajos), para el fin de turno sin aciertos. */
const MARIMBA_MUTED: Timbre = { ...MARIMBA, lowpass: 900 };

const n = (name: string, at: number, dur: number, vol: number, timbre: Timbre): Note => ({
  freq: hz(name),
  at,
  dur,
  vol,
  timbre,
});

export const EFFECTS: Record<SoundId, Effect> = {
  // Alguien más adivinó: campanita ascendente de tres notas (mi5, sol5, si5), ~0,6 s.
  guessOther: {
    notes: [
      n('E5', 0, 0.3, 0.2, BELL),
      n('G5', 0.08, 0.3, 0.2, BELL),
      n('B5', 0.16, 0.45, 0.2, BELL),
    ],
  },

  // Adivinaste tú: arpegio de do mayor en marimba (do5 a do6), con campanitas arriba (mi6, sol6, do7), ~1 s.
  guessSelf: {
    notes: [
      n('C5', 0, 0.22, 0.2, MARIMBA),
      n('E5', 0.07, 0.22, 0.2, MARIMBA),
      n('G5', 0.14, 0.22, 0.2, MARIMBA),
      n('C6', 0.21, 0.28, 0.2, MARIMBA),
      n('E6', 0.3, 0.6, 0.2, BELL),
      n('G6', 0.38, 0.55, 0.12, BELL),
      n('C7', 0.46, 0.5, 0.08, BELL),
    ],
  },

  // "¡Casi!": dos notas cortas de marimba, sol4 y la4 (pregunta que queda abierta), ~0,3 s.
  close: {
    notes: [n('G4', 0, 0.14, 0.2, MARIMBA), n('A4', 0.11, 0.2, 0.2, MARIMBA)],
  },

  // Te toca dibujar: dos toques iguales (re5) y una campanita larga (la5 con re6 arriba), ~1 s.
  yourTurn: {
    notes: [
      n('D5', 0, 0.13, 0.22, MARIMBA),
      n('D5', 0.15, 0.13, 0.22, MARIMBA),
      n('A5', 0.3, 0.7, 0.22, BELL),
      n('D6', 0.3, 0.55, 0.08, BELL),
    ],
  },

  // Empieza el dibujo: golpe suave y grave (seno que baja de 220 a 110 Hz) con un soplido de ruido, ~0,3 s.
  turnStart: {
    notes: [{ freq: 220, to: 110, at: 0, dur: 0.28, vol: 0.4, timbre: SOFT, attack: 0.004 }],
    noise: [{ at: 0, dur: 0.07, vol: 0.06, lowpass: 700 }],
  },

  // Tic de cuenta regresiva: clic seco y muy bajito (la5 en triángulo), 0,05 s.
  tick: {
    notes: [{ freq: hz('A5'), at: 0, dur: 0.05, vol: 0.09, timbre: BLIP, attack: 0.002 }],
  },

  // Fin de turno: acorde de do mayor (do5, mi5, sol5) como campanita, rasgueado, ~0,8 s.
  turnEnd: {
    notes: [
      n('C5', 0, 0.7, 0.14, BELL),
      n('E5', 0.025, 0.65, 0.14, BELL),
      n('G5', 0.05, 0.6, 0.14, BELL),
    ],
  },

  // Fin de turno sin aciertos: acorde de re menor (re4, fa4, la4) en marimba apagada, ~0,6 s.
  turnEndEmpty: {
    notes: [
      n('D4', 0, 0.5, 0.17, MARIMBA_MUTED),
      n('F4', 0.03, 0.45, 0.15, MARIMBA_MUTED),
      n('A4', 0.06, 0.4, 0.15, MARIMBA_MUTED),
    ],
  },

  // Fin de partida: arpegio ascendente (sol4 a sol5), acorde de do mayor en alto y destellos, ~1,8 s.
  gameEnd: {
    notes: [
      n('G4', 0, 0.2, 0.2, MARIMBA),
      n('C5', 0.12, 0.2, 0.2, MARIMBA),
      n('E5', 0.24, 0.2, 0.2, MARIMBA),
      n('G5', 0.36, 0.25, 0.2, MARIMBA),
      { ...n('C5', 0.6, 1.2, 0.13, BLIP), hold: 0.25 },
      { ...n('E5', 0.6, 1.2, 0.13, BLIP), hold: 0.25 },
      { ...n('G5', 0.6, 1.2, 0.13, BLIP), hold: 0.25 },
      n('C6', 0.6, 1.2, 0.14, BELL),
      n('E6', 0.95, 0.8, 0.1, BELL),
      n('G6', 1.1, 0.7, 0.09, BELL),
    ],
  },

  // Entra alguien: pop que sube (380 a 640 Hz), ~0,12 s.
  playerJoin: {
    notes: [{ freq: 380, to: 640, at: 0, dur: 0.12, vol: 0.18, timbre: SOFT, attack: 0.008 }],
    minGapMs: 200,
  },

  // Sale alguien: pop que baja (520 a 300 Hz), un poco más apagado, ~0,14 s.
  playerLeave: {
    notes: [{ freq: 520, to: 300, at: 0, dur: 0.14, vol: 0.15, timbre: SOFT, attack: 0.008 }],
    minGapMs: 200,
  },

  // Mensaje de otra persona: blip casi imperceptible (mi6 en seno), 0,06 s, con separación mínima.
  chat: {
    notes: [{ freq: hz('E6'), at: 0, dur: 0.06, vol: 0.05, timbre: SOFT, attack: 0.004 }],
    minGapMs: 400,
  },
};

/** Segundo en que termina el último sonido del efecto (para comprobar los topes de duración). */
export function effectEnd(effect: Effect): number {
  const ends = [
    ...effect.notes.map((note) => note.at + note.dur),
    ...(effect.noise ?? []).map((burst) => burst.at + burst.dur),
  ];
  return Math.max(0, ...ends);
}

/** Tope de duración: 1,2 s para todo, salvo la fanfarria final. */
export const MAX_EFFECT_SECONDS = 1.2;
export const MAX_FANFARE_SECONDS = 2;
