// Esquemas Zod de cada mensaje entrante (cliente -> servidor). Nada del cliente se cree sin pasar por aquí.

import { z } from 'zod';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_DRAW_SECONDS,
  MAX_POINTS_PER_MESSAGE,
  MAX_ROUNDS,
  MESSAGE_MAX_LENGTH,
  MIN_DRAW_SECONDS,
  MIN_ROUNDS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PALETTE,
  ROOM_CODE_LENGTH,
  SESSION_ID_MAX_LENGTH,
  SESSION_ID_MIN_LENGTH,
  STROKE_ID_MAX_LENGTH,
  STROKE_TOOLS,
  WORD_OPTIONS_COUNT,
} from './constants.js';
import type { Stroke } from './types.js';

// Caracteres de control y de formato (incluye saltos de línea y marcas bidireccionales).
const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/u;

/** Apodo: se recortan los espacios de los bordes, los espacios dobles se colapsan y se prohíben los caracteres de control. */
export const nicknameSchema = z
  .string()
  .max(NICKNAME_MAX_LENGTH * 4)
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(NICKNAME_MIN_LENGTH)
      .max(NICKNAME_MAX_LENGTH)
      .refine((s) => !CONTROL_CHARS.test(s)),
  );

export const sessionIdSchema = z
  .string()
  .min(SESSION_ID_MIN_LENGTH)
  .max(SESSION_ID_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Código de sala: se acepta en minúsculas y con espacios en los bordes; sale en mayúsculas. */
export const roomCodeSchema = z
  .string()
  .max(ROOM_CODE_LENGTH * 4)
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[A-Z]{${ROOM_CODE_LENGTH}}$`)));

export const strokeIdSchema = z.string().min(1).max(STROKE_ID_MAX_LENGTH);

/** Arreglo [x0, y0, x1, y1, ...]: enteros dentro del lienzo, de 1 a 64 puntos. */
export const pointsSchema = z
  .array(z.number().int())
  .min(2)
  .max(MAX_POINTS_PER_MESSAGE * 2)
  .refine((p) => p.length % 2 === 0, { message: 'points must have an even length' })
  .refine((p) => p.every((v, i) => v >= 0 && v <= (i % 2 === 0 ? CANVAS_WIDTH : CANVAS_HEIGHT)), {
    message: 'points must be inside the canvas',
  });

// --- room:* / game:* ------------------------------------------------------

export const roomCreateSchema = z.object({
  name: nicknameSchema,
  sessionId: sessionIdSchema,
});
export type RoomCreatePayload = z.infer<typeof roomCreateSchema>;

export const roomJoinSchema = z.object({
  code: roomCodeSchema,
  name: nicknameSchema,
  sessionId: sessionIdSchema,
});
export type RoomJoinPayload = z.infer<typeof roomJoinSchema>;

export const roomSettingsSchema = z.object({
  rounds: z.number().int().min(MIN_ROUNDS).max(MAX_ROUNDS),
  drawSeconds: z.number().int().min(MIN_DRAW_SECONDS).max(MAX_DRAW_SECONDS),
});
export type RoomSettingsPayload = z.infer<typeof roomSettingsSchema>;

/** Eventos sin datos (`game:start`, `canvas:undo`, `canvas:clear`): se acepta nada o null. */
export const emptyPayloadSchema = z.union([z.undefined(), z.null()]);

export const wordChooseSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .max(WORD_OPTIONS_COUNT - 1),
});
export type WordChoosePayload = z.infer<typeof wordChooseSchema>;

// --- stroke:* -------------------------------------------------------------

export const strokeStartSchema = z.object({
  id: strokeIdSchema,
  color: z.enum(PALETTE),
  size: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
  tool: z.enum(STROKE_TOOLS),
  points: pointsSchema,
}) satisfies z.ZodType<Stroke>;
export type StrokeStartPayload = Stroke;

export const strokePointsSchema = z.object({
  id: strokeIdSchema,
  points: pointsSchema,
});
export type StrokePointsPayload = z.infer<typeof strokePointsSchema>;

export const strokeEndSchema = z.object({
  id: strokeIdSchema,
});
export type StrokeEndPayload = z.infer<typeof strokeEndSchema>;

// --- message:send ---------------------------------------------------------

/** Texto: se recorta, se colapsan los espacios, no puede quedar vacío ni pasar de 80 caracteres ni traer caracteres de control. */
export const messageSendSchema = z.object({
  text: z
    .string()
    .max(MESSAGE_MAX_LENGTH * 4)
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(1)
        .max(MESSAGE_MAX_LENGTH)
        .refine((s) => !CONTROL_CHARS.test(s)),
    ),
});
export type MessageSendPayload = z.infer<typeof messageSendSchema>;
