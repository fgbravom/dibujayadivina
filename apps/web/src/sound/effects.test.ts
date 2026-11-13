import { describe, expect, it } from 'vitest';
import {
  EFFECTS,
  effectEnd,
  hz,
  MAX_EFFECT_SECONDS,
  MAX_FANFARE_SECONDS,
  SOUND_IDS,
  type SoundId,
} from './effects';

describe('hz', () => {
  it('convierte nombres de nota a frecuencia', () => {
    expect(hz('A4')).toBeCloseTo(440, 5);
    expect(hz('A5')).toBeCloseTo(880, 5);
    expect(hz('C4')).toBeCloseTo(261.63, 1);
    expect(hz('F#4')).toBeCloseTo(369.99, 1);
    expect(hz('Bb3')).toBeCloseTo(233.08, 1);
  });

  it('rechaza nombres inválidos', () => {
    expect(() => hz('H4')).toThrow();
  });
});

describe('catálogo de efectos', () => {
  it('define todos los efectos', () => {
    expect(Object.keys(EFFECTS).sort()).toEqual([...SOUND_IDS].sort());
  });

  it.each(SOUND_IDS)('%s respeta el tope de duración', (id: SoundId) => {
    const limit = id === 'gameEnd' ? MAX_FANFARE_SECONDS : MAX_EFFECT_SECONDS;
    const end = effectEnd(EFFECTS[id]);
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThanOrEqual(limit);
  });

  it.each(SOUND_IDS)('%s tiene datos válidos y volumen moderado', (id: SoundId) => {
    const effect = EFFECTS[id];
    expect(effect.notes.length).toBeGreaterThan(0);
    let peak = 0;
    for (const note of effect.notes) {
      expect(note.freq).toBeGreaterThan(20);
      expect(note.freq).toBeLessThan(10000);
      expect(note.at).toBeGreaterThanOrEqual(0);
      expect(note.dur).toBeGreaterThan(0);
      expect(note.vol).toBeGreaterThan(0);
      expect(note.vol).toBeLessThanOrEqual(0.4);
      peak += note.vol;
    }
    // Suma de picos (peor caso, todo a la vez): lejos de saturar con el volumen general.
    expect(peak).toBeLessThan(2);
  });

  it('chat, entrar y salir llevan separación mínima', () => {
    expect(EFFECTS.chat.minGapMs).toBeGreaterThanOrEqual(300);
    expect(EFFECTS.playerJoin.minGapMs).toBeGreaterThan(0);
    expect(EFFECTS.playerLeave.minGapMs).toBeGreaterThan(0);
  });
});
