// Constantes del contrato (PLAN.md secciones 2 y 4). Nadie las duplica: se importan de aquí.

// --- Lienzo ---------------------------------------------------------------

/** Espacio lógico fijo del lienzo (4:3). Cada cliente lo escala a su pantalla. */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

/** 12 colores del lienzo. `Stroke.color` es uno de estos. */
export const PALETTE = [
  '#000000', // negro
  '#ffffff', // blanco
  '#7f7f7f', // gris
  '#e63946', // rojo
  '#f77f00', // naranja
  '#fcbf49', // amarillo
  '#2a9d8f', // verde
  '#1d3557', // azul marino
  '#457b9d', // celeste
  '#7b2cbf', // morado
  '#f28ab2', // rosado
  '#8b5a2b', // café
] as const;
export type PaletteColor = (typeof PALETTE)[number];

/** Grosores disponibles (px en el espacio lógico). */
export const STROKE_SIZES = [4, 8, 16, 32] as const;
export type StrokeSize = (typeof STROKE_SIZES)[number];

export const STROKE_TOOLS = ['brush', 'eraser'] as const;
export type StrokeTool = (typeof STROKE_TOOLS)[number];

export const DEFAULT_STROKE_COLOR: PaletteColor = '#000000';
export const DEFAULT_STROKE_SIZE: StrokeSize = 8;

/** Color de fondo del lienzo; la goma pinta con este color. */
export const CANVAS_BACKGROUND = '#ffffff';

/** El cliente del dibujante junta puntos y los envía cada este intervalo. */
export const STROKE_FLUSH_INTERVAL_MS = 40;

// --- Límites de entrada ---------------------------------------------------

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;
export const MESSAGE_MAX_LENGTH = 80;
/** Máximo de puntos (pares x,y) por mensaje de trazo; el arreglo `points` trae el doble de números. */
export const MAX_POINTS_PER_MESSAGE = 64;
export const MAX_STROKE_MESSAGES_PER_SECOND = 30;
export const MAX_TEXT_MESSAGES_PER_SECOND = 3;
export const MAX_STROKES_PER_TURN = 2000;

// --- Reglas del juego (valores por defecto, sección 2) --------------------

export const MIN_PLAYERS_TO_START = 2;
export const MAX_PLAYERS = 12;

export const DEFAULT_ROUNDS = 3;
export const DEFAULT_DRAW_SECONDS = 80;
/** Rango permitido para los ajustes que cambia el anfitrión (supuesto, el plan no lo fija). */
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;
export const MIN_DRAW_SECONDS = 30;
export const MAX_DRAW_SECONDS = 180;

/** Opciones de palabra que ve el dibujante y tiempo para elegir (si no elige, se asigna la primera). */
export const WORD_OPTIONS_COUNT = 3;
export const CHOOSE_SECONDS = 10;
/** Tras el primer acierto, el tiempo restante baja a esto si quedaba más. */
export const AFTER_FIRST_GUESS_SECONDS = 20;
/** Pausa entre turnos mostrando la palabra y los puntos. */
export const TURN_END_SECONDS = 5;

/** Puntos de los adivinadores según orden de acierto; del cuarto en adelante, el último valor. */
export const GUESSER_SCORES = [10, 8, 6, 4] as const;
export const DRAWER_FIRST_GUESS_SCORE = 10;
export const DRAWER_EXTRA_GUESS_SCORE = 1;

/** Fracciones del tiempo de dibujo transcurrido en que se revela una letra. */
export const HINT_TIME_FRACTIONS = [0.5, 0.75] as const;
/** Nunca se revela más de esta fracción de las letras de la palabra. */
export const MAX_REVEALED_FRACTION = 1 / 3;

// --- Sesiones y salas -----------------------------------------------------

/** Un jugador caído conserva su puesto y puntaje durante este tiempo. */
export const RECONNECT_GRACE_SECONDS = 30;
/** Una sala vacía se borra tras este tiempo. */
export const EMPTY_ROOM_TTL_SECONDS = 60;

export const ROOM_CODE_LENGTH = 4;
/** Letras sin caracteres ambiguos (sin I, L ni O). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export const SESSION_ID_MIN_LENGTH = 8;
export const SESSION_ID_MAX_LENGTH = 64;
export const STROKE_ID_MAX_LENGTH = 64;
