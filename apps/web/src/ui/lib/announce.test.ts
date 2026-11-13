import { describe, expect, it } from 'vitest';
import { turnAnnouncement, type TurnAnnouncementInput } from './announce';

const base: TurnAnnouncementInput = {
  phase: 'CHOOSING',
  round: 2,
  totalRounds: 3,
  isDrawer: false,
  drawerName: 'Ana',
  word: null,
  mask: null,
  endReason: null,
};

describe('turnAnnouncement', () => {
  it('al elegir palabra anuncia la ronda y quién elige', () => {
    expect(turnAnnouncement(base)).toBe('Ronda 2 de 3. Ana está eligiendo una palabra.');
    expect(turnAnnouncement({ ...base, isDrawer: true })).toBe(
      'Ronda 2 de 3. Te toca dibujar: elige una palabra.',
    );
  });

  it('al dibujar, el dibujante oye su palabra y el resto la cantidad de letras', () => {
    expect(turnAnnouncement({ ...base, phase: 'DRAWING', isDrawer: true, word: 'huemul' })).toBe(
      'Dibuja: huemul.',
    );
    expect(turnAnnouncement({ ...base, phase: 'DRAWING', mask: '_ _ _   _ _' })).toBe(
      'Ana dibuja. Palabra de 5 letras. ¡Adivina!',
    );
  });

  it('no cambia con las pistas: la máscara revelada da el mismo aviso', () => {
    const hidden = turnAnnouncement({ ...base, phase: 'DRAWING', mask: '_ _ _ _' });
    const hinted = turnAnnouncement({ ...base, phase: 'DRAWING', mask: 'c _ _ _' });
    expect(hinted).toBe(hidden);
  });

  it('al terminar el turno anuncia la palabra y el motivo', () => {
    expect(
      turnAnnouncement({
        ...base,
        phase: 'TURN_END',
        word: 'micro',
        endReason: 'Se acabó el tiempo',
      }),
    ).toBe('La palabra era micro. Se acabó el tiempo');
    expect(turnAnnouncement({ ...base, phase: 'TURN_END' })).toBe('Fin del turno.');
  });

  it('fuera de la partida no anuncia nada', () => {
    expect(turnAnnouncement({ ...base, phase: 'LOBBY' })).toBe('');
  });
});
