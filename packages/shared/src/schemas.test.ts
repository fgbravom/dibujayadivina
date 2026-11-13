import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_POINTS_PER_MESSAGE,
  PALETTE,
  STROKE_SIZES,
  emptyPayloadSchema,
  messageSendSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomSettingsSchema,
  strokePointsSchema,
  strokeStartSchema,
  wordChooseSchema,
} from './index.js';

const sessionId = 'session-1234';

describe('constantes', () => {
  it('la paleta tiene 12 colores distintos y 4 grosores', () => {
    expect(PALETTE).toHaveLength(12);
    expect(new Set(PALETTE).size).toBe(12);
    expect(STROKE_SIZES).toEqual([4, 8, 16, 32]);
    expect([CANVAS_WIDTH, CANVAS_HEIGHT]).toEqual([800, 600]);
  });
});

describe('room:create / room:join', () => {
  it('limpia el apodo', () => {
    const r = roomCreateSchema.parse({ name: '  Ana   María ', sessionId });
    expect(r.name).toBe('Ana María');
  });

  it('rechaza apodos cortos, largos o con caracteres de control', () => {
    expect(roomCreateSchema.safeParse({ name: 'A', sessionId }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ name: 'x'.repeat(17), sessionId }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ name: 'Ana\u0000', sessionId }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ name: 'Ana‮B', sessionId }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ name: 'x'.repeat(16), sessionId }).success).toBe(true);
  });

  it('rechaza un sessionId inválido', () => {
    expect(roomCreateSchema.safeParse({ name: 'Ana', sessionId: 'corto' }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ name: 'Ana', sessionId: 'con espacios!!' }).success).toBe(
      false,
    );
    expect(roomCreateSchema.safeParse({ name: 'Ana' }).success).toBe(false);
  });

  it('normaliza el código a mayúsculas y exige 4 letras', () => {
    expect(roomJoinSchema.parse({ code: ' abcd ', name: 'Ana', sessionId }).code).toBe('ABCD');
    expect(roomJoinSchema.safeParse({ code: 'abc', name: 'Ana', sessionId }).success).toBe(false);
    expect(roomJoinSchema.safeParse({ code: 'ab1d', name: 'Ana', sessionId }).success).toBe(false);
  });
});

describe('room:settings', () => {
  it('acepta valores dentro de rango y rechaza el resto', () => {
    expect(roomSettingsSchema.safeParse({ rounds: 3, drawSeconds: 80 }).success).toBe(true);
    expect(roomSettingsSchema.safeParse({ rounds: 0, drawSeconds: 80 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ rounds: 3, drawSeconds: 5 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ rounds: 2.5, drawSeconds: 80 }).success).toBe(false);
  });
});

describe('word:choose', () => {
  it('acepta índices 0 a 2', () => {
    expect(wordChooseSchema.safeParse({ index: 2 }).success).toBe(true);
    expect(wordChooseSchema.safeParse({ index: 3 }).success).toBe(false);
    expect(wordChooseSchema.safeParse({ index: -1 }).success).toBe(false);
  });
});

describe('stroke:*', () => {
  const stroke = { id: 's1', color: '#000000', size: 8, tool: 'brush', points: [0, 0, 800, 600] };

  it('acepta un trazo válido', () => {
    expect(strokeStartSchema.safeParse(stroke).success).toBe(true);
  });

  it('rechaza color fuera de la paleta, grosor o herramienta inválidos', () => {
    expect(strokeStartSchema.safeParse({ ...stroke, color: '#123456' }).success).toBe(false);
    expect(strokeStartSchema.safeParse({ ...stroke, size: 10 }).success).toBe(false);
    expect(strokeStartSchema.safeParse({ ...stroke, tool: 'bucket' }).success).toBe(false);
  });

  it('rechaza puntos impares, vacíos, fuera del lienzo o no enteros', () => {
    expect(strokePointsSchema.safeParse({ id: 's1', points: [1, 2, 3] }).success).toBe(false);
    expect(strokePointsSchema.safeParse({ id: 's1', points: [] }).success).toBe(false);
    expect(strokePointsSchema.safeParse({ id: 's1', points: [801, 0] }).success).toBe(false);
    expect(strokePointsSchema.safeParse({ id: 's1', points: [0, 601] }).success).toBe(false);
    expect(strokePointsSchema.safeParse({ id: 's1', points: [-1, 0] }).success).toBe(false);
    expect(strokePointsSchema.safeParse({ id: 's1', points: [1.5, 2] }).success).toBe(false);
    expect(strokePointsSchema.safeParse({ id: 's1', points: [Number.NaN, 2] }).success).toBe(false);
  });

  it('acepta hasta 64 puntos por mensaje y no más', () => {
    const ok = Array.from({ length: MAX_POINTS_PER_MESSAGE * 2 }, () => 10);
    expect(strokePointsSchema.safeParse({ id: 's1', points: ok }).success).toBe(true);
    expect(strokePointsSchema.safeParse({ id: 's1', points: [...ok, 1, 1] }).success).toBe(false);
  });
});

describe('message:send', () => {
  it('limpia el texto', () => {
    expect(messageSendSchema.parse({ text: '  hola   mundo ' }).text).toBe('hola mundo');
  });

  it('rechaza vacío, demasiado largo o no-string', () => {
    expect(messageSendSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(messageSendSchema.safeParse({ text: 'x'.repeat(81) }).success).toBe(false);
    expect(messageSendSchema.safeParse({ text: 'x'.repeat(80) }).success).toBe(true);
    expect(messageSendSchema.safeParse({ text: 42 }).success).toBe(false);
  });
});

describe('eventos sin datos', () => {
  it('aceptan undefined o null y rechazan otra cosa', () => {
    expect(emptyPayloadSchema.safeParse(undefined).success).toBe(true);
    expect(emptyPayloadSchema.safeParse(null).success).toBe(true);
    expect(emptyPayloadSchema.safeParse({}).success).toBe(false);
  });
});
