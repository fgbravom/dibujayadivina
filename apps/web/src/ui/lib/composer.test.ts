import { PHASES } from '@dya/shared';
import { describe, expect, it } from 'vitest';
import { COMPOSER_TEXT, getComposerMode, prepareMessage } from './composer';

describe('getComposerMode', () => {
  it('en DRAWING, quien no adivinó manda intentos', () => {
    expect(getComposerMode({ phase: 'DRAWING', isDrawer: false, hasGuessed: false })).toBe('guess');
  });

  it('en DRAWING, quien ya adivinó escribe en el canal de adivinadores', () => {
    expect(getComposerMode({ phase: 'DRAWING', isDrawer: false, hasGuessed: true })).toBe(
      'guessed',
    );
  });

  it('en DRAWING, el dibujante escribe en el canal de adivinadores', () => {
    expect(getComposerMode({ phase: 'DRAWING', isDrawer: true, hasGuessed: false })).toBe(
      'guessed',
    );
  });

  it('fuera de DRAWING todo es chat normal', () => {
    for (const phase of PHASES.filter((p) => p !== 'DRAWING')) {
      expect(getComposerMode({ phase, isDrawer: false, hasGuessed: false })).toBe('chat');
      expect(getComposerMode({ phase, isDrawer: true, hasGuessed: true })).toBe('chat');
    }
  });

  it('cada modo tiene un marcador de posición distinto', () => {
    const placeholders = new Set(Object.values(COMPOSER_TEXT).map((t) => t.placeholder));
    expect(placeholders.size).toBe(3);
  });
});

describe('prepareMessage', () => {
  it('recorta espacios y descarta vacíos', () => {
    expect(prepareMessage('  hola  ', 80)).toBe('hola');
    expect(prepareMessage('   ', 80)).toBeNull();
    expect(prepareMessage('', 80)).toBeNull();
  });

  it('respeta el largo máximo', () => {
    expect(prepareMessage('a'.repeat(100), 80)).toHaveLength(80);
  });
});
