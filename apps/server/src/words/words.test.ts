import { describe, expect, it, vi } from 'vitest';
import { normalizeGuess } from '@dya/shared';
import { isCorrectGuess, pickOptions, WORDS, type WordEntry } from './index.js';

const CATEGORIES = ['comida', 'lugares', 'naturaleza', 'cultura', 'chilenismos', 'objetos', 'personajes'];

/** PRNG determinista (mulberry32) para pruebas reproducibles. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allTextsExcept(keep: readonly WordEntry[]): Set<string> {
  const keepSet = new Set(keep.map((w) => w.text));
  return new Set(WORDS.map((w) => w.text).filter((t) => !keepSet.has(t)));
}

describe('WORDS', () => {
  it('cumple el esquema de cada entrada', () => {
    for (const w of WORDS) {
      expect(typeof w.text).toBe('string');
      expect(w.text.trim()).not.toBe('');
      expect(w.text).toBe(w.text.toLowerCase());
      expect(CATEGORIES).toContain(w.category);
      expect([1, 2, 3]).toContain(w.difficulty);
      if (w.accept !== undefined) {
        expect(Array.isArray(w.accept)).toBe(true);
        for (const a of w.accept) {
          expect(a.trim()).not.toBe('');
          expect(a).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('tiene exactamente 500 palabras', () => {
    expect(WORDS.length).toBe(500);
  });

  it('tiene las tres dificultades disponibles y al menos 150 de cada una', () => {
    const levels = new Set(WORDS.map((w) => w.difficulty));
    expect([...levels].sort()).toEqual([1, 2, 3]);
    for (const d of [1, 2, 3]) {
      expect(WORDS.filter((w) => w.difficulty === d).length).toBeGreaterThanOrEqual(150);
    }
  });

  it('incluye la categoría personajes', () => {
    expect(WORDS.some((w) => w.category === 'personajes')).toBe(true);
  });

  it('no tiene textos duplicados tras normalizar', () => {
    const normalized = WORDS.map((w) => normalizeGuess(w.text));
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('ninguna forma aceptada coincide con una forma de otra palabra', () => {
    const owner = new Map<string, number>();
    WORDS.forEach((w, i) => {
      const forms = new Set([w.text, ...(w.accept ?? [])].map((f) => normalizeGuess(f)));
      for (const form of forms) {
        const prev = owner.get(form);
        expect(prev === undefined || prev === i, `"${form}" aparece en dos palabras`).toBe(true);
        owner.set(form, i);
      }
    });
  });
});

describe('pickOptions', () => {
  it('devuelve n palabras distintas sin repetir dentro de la llamada', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickOptions(new Set(), 3, seededRng(seed));
      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((w) => w.text)).size).toBe(3);
    }
  });

  it('no usa Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      pickOptions(new Set(), 3, seededRng(7));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('respeta used mientras haya suficientes disponibles', () => {
    // Deja libres solo 6 palabras, de distintas dificultades.
    const free = [
      ...WORDS.filter((w) => w.difficulty === 1).slice(0, 2),
      ...WORDS.filter((w) => w.difficulty === 2).slice(0, 2),
      ...WORDS.filter((w) => w.difficulty === 3).slice(0, 2),
    ];
    const used = allTextsExcept(free);
    for (let seed = 1; seed <= 30; seed++) {
      const picked = pickOptions(used, 3, seededRng(seed));
      for (const w of picked) {
        expect(used.has(w.text)).toBe(false);
      }
    }
  });

  it('recurre a todo el banco cuando used agota las opciones', () => {
    const free = WORDS.slice(0, 2);
    const used = allTextsExcept(free);
    const picked = pickOptions(used, 3, seededRng(11));
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((w) => w.text)).size).toBe(3);
    expect(picked.some((w) => used.has(w.text))).toBe(true);
  });

  it('recurre a palabras usadas solo de la dificultad agotada', () => {
    // Agota todas las palabras frescas de dificultad 3; deja suficientes frescas de 1 y 2.
    const fresh = [
      ...WORDS.filter((w) => w.difficulty === 1).slice(0, 10),
      ...WORDS.filter((w) => w.difficulty === 2).slice(0, 10),
    ];
    const used = allTextsExcept(fresh);
    for (let seed = 1; seed <= 30; seed++) {
      const picked = pickOptions(used, 3, seededRng(seed));
      expect(picked).toHaveLength(3);
      expect(picked.map((w) => w.difficulty).sort()).toEqual([1, 2, 3]);
      // Las de dificultad 1 y 2 deben ser frescas; la 3 es una usada de ese nivel.
      expect(used.has(picked.find((w) => w.difficulty === 1)!.text)).toBe(false);
      expect(used.has(picked.find((w) => w.difficulty === 2)!.text)).toBe(false);
      expect(used.has(picked.find((w) => w.difficulty === 3)!.text)).toBe(true);
    }
  });

  it('mezcla dificultades: con n=3 trae una de cada nivel', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickOptions(new Set(), 3, seededRng(seed));
      expect(picked.map((w) => w.difficulty).sort()).toEqual([1, 2, 3]);
    }
  });

  it('es determinista con un rng con semilla', () => {
    const a = pickOptions(new Set(), 3, seededRng(42));
    const b = pickOptions(new Set(), 3, seededRng(42));
    expect(a).toEqual(b);
  });

  it('devuelve vacío con n=0', () => {
    expect(pickOptions(new Set(), 0, seededRng(1))).toEqual([]);
  });
});

describe('isCorrectGuess', () => {
  const entry: WordEntry = {
    text: 'año nuevo',
    category: 'cultura',
    difficulty: 2,
    accept: ['fin de año'],
  };

  it('acepta el texto exacto', () => {
    expect(isCorrectGuess(entry, 'año nuevo')).toBe(true);
  });

  it('ignora mayúsculas', () => {
    expect(isCorrectGuess(entry, 'AÑO NUEVO')).toBe(true);
  });

  it('acepta sin tildes en las vocales', () => {
    const cond: WordEntry = { text: 'cóndor', category: 'naturaleza', difficulty: 1 };
    expect(isCorrectGuess(cond, 'condor')).toBe(true);
    expect(isCorrectGuess(cond, 'CÓNDOR')).toBe(true);
  });

  it('acepta las formas alternativas de accept', () => {
    expect(isCorrectGuess(entry, 'Fin de Año')).toBe(true);
  });

  it('rechaza "ano" para "año nuevo" porque la ñ se conserva', () => {
    expect(isCorrectGuess(entry, 'ano nuevo')).toBe(false);
    const ano: WordEntry = { text: 'año', category: 'cultura', difficulty: 1 };
    expect(isCorrectGuess(ano, 'ano')).toBe(false);
  });

  it('rechaza respuestas que no coinciden', () => {
    expect(isCorrectGuess(entry, 'navidad')).toBe(false);
  });
});
