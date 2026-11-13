# Motor de reglas — especificación (T1)

Especificación de `apps/server/src/game/**`. La usa quien implementa el motor (T1) y quien lo conecta a la red (T5). Donde este documento y la sección 2 de `PLAN.md` difieran, manda este documento. Donde un nombre de tipo difiera de `@dya/shared`, manda `@dya/shared`: el motor no redefine lo que el contrato ya exporta.

## 1. Principios

- Motor puro: `reduce(state, action, ctx)` devuelve estado nuevo y una lista ordenada de efectos. Sin `Date`, `Math.random`, `setTimeout` ni Socket.IO.
- El reloj, el azar, el selector de palabras y el generador de ids se inyectan en `ctx`.
- `reduce` parte con `structuredClone(state)` y muta la copia. El estado es chico porque no guarda trazos.
- El `switch` de acciones es exhaustivo y termina en `never`.
- El `sessionId` y la palabra secreta nunca salen en un efecto dirigido a quien no deba verlos.

## 2. Archivos

```
apps/server/src/game/
  index.ts        API pública: createGame, reduce, nextWakeAt, canDraw, buildSnapshot y tipos
  types.ts        GameState, EnginePlayer, TurnState, Action, Effect, Recipient, EngineContext, EngineConfig
  config.ts       DEFAULT_ENGINE_CONFIG, armado desde las constantes de @dya/shared
  reducer.ts      reduce, advance (vencimientos) y despacho por acción
  players.ts      join y reconexión, disconnect, removePlayer, transferHost, uniqueName
  turns.ts        startNextTurn, beginDrawing, revealHint, endTurn, endGame, toLobby, checkAllGuessed
  messages.ts     handleMessage, classifyGuess
  scoring.ts      guesserPoints, drawerPoints, computeGains, ranking
  levenshtein.ts  distancia de edición con salida temprana
  snapshot.ts     buildSnapshot, toPlayer
  testing.ts      arnés de pruebas (solo lo importan las pruebas)
  *.test.ts
```

## 3. Tipos

```ts
import type { ErrorCode, GameSettings, Phase, Player, RankingEntry, RoomState,
  ServerToClientEvents, TurnEndReason } from '@dya/shared';

export type PlayerId = string;
export interface WordEntry { text: string; accept?: string[] } // subconjunto del tipo de words/

export interface EngineConfig {       // valores por defecto desde las constantes de @dya/shared
  minPlayers: number;                 // MIN_PLAYERS_TO_START
  maxPlayers: number;                 // MAX_PLAYERS
  optionsCount: number;               // WORD_OPTIONS_COUNT
  chooseMs: number;                   // CHOOSE_SECONDS * 1000
  shortenToMs: number;                // AFTER_FIRST_GUESS_SECONDS * 1000
  turnEndMs: number;                  // TURN_END_SECONDS * 1000
  graceMs: number;                    // RECONNECT_GRACE_SECONDS * 1000
  hintFractions: readonly number[];   // HINT_TIME_FRACTIONS
  drawMsOverride?: number;            // solo pruebas e2e: reemplaza settings.drawSeconds * 1000
}

export interface EnginePlayer {
  id: PlayerId;
  sessionId: string;                  // secreto
  name: string;
  score: number;
  connected: boolean;
  connId: string | null;              // socket actual
  disconnectedAt: number | null;      // inicio de la gracia
}

export interface Guess { playerId: PlayerId; points: number } // en orden de acierto

export interface TurnState {
  drawerId: PlayerId;
  options: WordEntry[];
  word: WordEntry | null;             // definida desde DRAWING
  answers: string[];                  // normalizeGuess de text y de cada accept
  revealed: number[];                 // índices revelados, según getMaskableIndices
  pendingHints: number[];             // instantes absolutos ascendentes, todos < deadline
  guesses: Guess[];
  result: TurnEnd | null;             // tipo TurnEnd de @dya/shared; se fija al entrar en TURN_END
}

export interface GameState {
  phase: Phase;
  config: EngineConfig;
  settings: GameSettings;
  players: EnginePlayer[];            // orden del arreglo = orden de llegada
  hostId: PlayerId | null;
  round: number;                      // 0 en LOBBY
  drawnThisRound: PlayerId[];
  usedWords: string[];                // textos de todas las opciones ofrecidas en la partida
  turn: TurnState | null;             // solo en CHOOSING, DRAWING y TURN_END
  deadline: number | null;            // fin de CHOOSING, DRAWING o TURN_END; null en LOBBY y GAME_END
  ranking: RankingEntry[] | null;     // solo en GAME_END
}

export interface EngineContext {
  now: number;
  rng: () => number;
  pickWords: (used: readonly string[], n: number) => WordEntry[];
  newId: () => string;
}

export type Action =
  | { type: 'join'; sessionId: string; name: string; connId: string } // también reconexión y otra pestaña
  | { type: 'disconnect'; playerId: PlayerId; connId: string }
  | { type: 'leave'; playerId: PlayerId }                             // borrado inmediato
  | { type: 'updateSettings'; playerId: PlayerId; rounds: number; drawSeconds: number }
  | { type: 'start'; playerId: PlayerId }
  | { type: 'chooseWord'; playerId: PlayerId; index: number }
  | { type: 'message'; playerId: PlayerId; text: string }
  | { type: 'tick' };

export type Recipient =
  | { kind: 'room' }
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'roomExcept'; playerId: PlayerId }
  | { kind: 'players'; playerIds: PlayerId[] };   // canal "guessed", resuelto al reducir

export type EngineEvent =
  | 'player:joined' | 'player:left' | 'player:updated'
  | 'turn:choosing' | 'turn:options' | 'turn:start' | 'turn:word' | 'turn:hint'
  | 'turn:timer' | 'turn:end' | 'game:end' | 'message:new' | 'guess:correct' | 'guess:close';

export type EngineSnapshot = Omit<RoomState, 'code' | 'strokes'>; // la red agrega code y strokes

export type Effect =
  | { [E in EngineEvent]: { type: 'emit'; to: Recipient; event: E;
        payload: Parameters<ServerToClientEvents[E]>[0] } }[EngineEvent]
  | { type: 'snapshot'; playerId: PlayerId; snapshot: EngineSnapshot } // la red envía room:state
  | { type: 'strokes:reset' }                                          // la red vacía su historial
  | { type: 'disconnectConn'; connId: string };                        // la red cierra el socket viejo

export interface ReduceResult {
  state: GameState;
  effects: Effect[];        // en orden causal
  error?: ErrorCode;        // con error, el estado solo refleja advance() y no hay efectos de la acción
  playerId?: PlayerId;      // en un join exitoso
}
```

API pública:

```ts
createGame(config?: Partial<EngineConfig>, settings?: Partial<GameSettings>): GameState
reduce(state: GameState, action: Action, ctx: EngineContext): ReduceResult
nextWakeAt(state: GameState): number | null
canDraw(state: GameState, playerId: PlayerId): boolean   // DRAWING y es el dibujante
buildSnapshot(state: GameState, viewerId: PlayerId, now: number): EngineSnapshot
```

Errores: se usan los `ErrorCode` del contrato. Índice de palabra o ajustes fuera de rango devuelven `invalid_payload`.

## 4. Plazos

El estado expone vencimientos absolutos y la red mantiene un único temporizador por sala.

- Vencimientos: `deadline` de la fase, cada `turn.pendingHints` y `disconnectedAt + graceMs` de cada jugador desconectado.
- `nextWakeAt` devuelve el mínimo, o `null`.
- La red, después de cada `reduce`, reprograma un `setTimeout` hasta `nextWakeAt` que despacha `{ type: 'tick' }`.

Toda acción ejecuta primero `advance`: mientras el vencimiento más temprano sea `<= now`, lo procesa (tope de 50 vueltas; superarlo lanza error). En empate: gracia, luego pista, luego `deadline`. Las fases nuevas calculan su `deadline` desde `ctx.now`.

| Vencimiento | Qué hace |
|---|---|
| Gracia de un jugador | `removePlayer` |
| `deadline` de CHOOSING | `beginDrawing(options[0])` |
| Pista | `revealHint` |
| `deadline` de DRAWING | `endTurn('timeout')` |
| `deadline` de TURN_END | `startNextTurn` |

Consecuencia: un intento o un `chooseWord` que llega después de su plazo se evalúa contra la fase nueva (chat de TURN_END, o `wrong_phase`).

**Pistas.** Letras revelables: `getMaskableIndices(word)`. Cantidad: `min(hintFractions.length, maxRevealCount(word))`. Instantes: `inicio + floor(drawMs * fracción)`, sobre la duración original. `revealHint` elige al azar con `rng` una letra aún oculta y emite `turn:hint { mask }` a la sala. La máscara siempre se arma con `maskWord` de `@dya/shared`.

**Acortar.** Con el primer acierto, si el turno no terminó con él y `deadline - now > shortenToMs`: `deadline = now + shortenToMs`, se descartan las pistas pendientes que queden fuera, y se emite `turn:timer { endsAt }`.

## 5. Rutinas

**`startNextTurn`**
1. Candidato: el primer jugador, en orden de llegada, conectado y que no esté en `drawnThisRound`.
2. Si no hay: si `round < settings.rounds`, `round++`, se vacía `drawnThisRound` y se reintenta una vez. Si sigue sin haber, o era la última ronda, `endGame`.
3. `options = pickWords(usedWords, optionsCount)` (vacío lanza error); sus textos se agregan a `usedWords`; el candidato se agrega a `drawnThisRound`; fase CHOOSING con `deadline = now + chooseMs`.
4. Efectos: `strokes:reset`; `turn:choosing { drawerId, endsAt }` a la sala; `turn:options { words }` al dibujante.

**`beginDrawing(entry)`**: fija `word`, `answers`, `pendingHints`; fase DRAWING con `deadline = now + drawMs`. Efectos: `turn:start` a la sala; `turn:word` al dibujante.

**`endTurn(reason)`**: calcula ganancias (todo 0 si `drawerLeft`), suma puntajes a los jugadores presentes, fase TURN_END con `deadline = now + turnEndMs`. Efecto: `turn:end` a la sala, con ganancias y puntajes de todos los presentes.

**`endGame`**: `turn = null`, fase GAME_END, `deadline = null`, `ranking` calculado. Efecto: `game:end { ranking }`.

**`toLobby`**: fase LOBBY, `round = 0`, `turn = null`, `deadline = null`, `ranking = null`. Los puntajes se conservan hasta el próximo inicio. Efectos: `strokes:reset` y `snapshot` a cada conectado.

**`checkAllGuessed`**: en DRAWING, si hay al menos un acierto y todo jugador conectado que no dibuja ya acertó, `endTurn('allGuessed')`.

**`removePlayer(id)`**
1. Lo quita y emite `player:left`.
2. Si era anfitrión, el rol pasa al conectado más antiguo (si no hay, al más antiguo) y se emite `player:updated` del nuevo.
3. Si la fase es CHOOSING, DRAWING o TURN_END y quedan menos de `minPlayers` jugadores (contando los que están en gracia): `toLobby` y termina.
4. Si era el dibujante: en CHOOSING, `startNextTurn`; en DRAWING, `endTurn('drawerLeft')`. Si era adivinador en DRAWING: `checkAllGuessed`.

## 6. Acciones

| Acción | Fase | Guardas | Resultado |
|---|---|---|---|
| `join`, sesión nueva | cualquiera | sala llena: `room_full` | Crea el jugador (`newId`, `uniqueName`, 0 puntos). Si no hay anfitrión, lo es. `player:joined` al resto y `snapshot` al nuevo. En DRAWING puede adivinar de inmediato. |
| `join`, sesión existente | cualquiera | ninguna | Si estaba conectado con otro `connId`: `disconnectConn` del viejo. Queda conectado con el `connId` nuevo. Si estaba desconectado: `player:updated` al resto. Siempre `snapshot`. No cambia el nombre. |
| `disconnect` | cualquiera | `connId` distinto o ya desconectado: no hace nada | Marca desconectado e inicia la gracia. `player:updated`. Dibujante en CHOOSING: `startNextTurn`. Dibujante en DRAWING: `endTurn('drawerLeft')`. Adivinador en DRAWING: `checkAllGuessed`. No transfiere el anfitrión. |
| `leave` | cualquiera | no existe: `not_in_room` | `removePlayer` |
| `updateSettings` | LOBBY | `not_host`, `wrong_phase`, `invalid_payload` | Actualiza y manda `snapshot` a cada conectado. |
| `start` | LOBBY | `not_host`, `wrong_phase`, menos de `minPlayers` conectados: `not_enough_players` | Puntajes a 0 (con `player:updated` de quien cambió), `round = 1`, `usedWords = []`, y `startNextTurn`. |
| `start` | GAME_END | `not_host` | `toLobby` ("jugar de nuevo" vuelve a la sala de espera). |
| `chooseWord` | CHOOSING | `wrong_phase`, `not_drawer`, `invalid_payload` | `beginDrawing(options[index])` |
| `message` | no DRAWING | no existe: `not_in_room` | `message:new` canal `all` a la sala. |
| `message` | DRAWING | igual | Ver abajo. |
| `tick` | cualquiera | ninguna | Solo `advance`. |

El texto del mensaje llega ya saneado por la red; si queda vacío tras `trim`, no hay efectos ni error.

**Mensajes en DRAWING**, en este orden:

1. Lo envía el dibujante o quien ya acertó: `message:new` canal `guessed` a `players([dibujante, ...quienes acertaron])`. No se evalúa.
2. `n = normalizeGuess(text)`. Si `n` está en `answers`: es acierto. Se registra con `guesserPoints(posición)`; se emite `guess:correct { playerId }` a la sala y `turn:word { word }` a quien acertó; luego `checkAllGuessed`; si el turno sigue y fue el primer acierto, se acorta el tiempo. El texto nunca se emite.
3. El mensaje contiene una respuesta como palabras completas (`"es la micro?"`): `message:new` canal `all` solo a su autor, para no filtrarla.
4. Distancia de edición 1 a alguna respuesta: `message:new` a la sala y luego `guess:close` al autor.
5. Resto: `message:new` canal `all` a la sala.

## 7. Puntaje, ranking y nombres

- Adivinadores: `GUESSER_SCORES[i]`, y el último valor para los siguientes.
- Dibujante: 0 sin aciertos; si no, `DRAWER_FIRST_GUESS_SCORE + DRAWER_EXTRA_GUESS_SCORE * (n - 1)`. `n` cuenta también a quien acertó y se fue.
- Los puntajes se suman al terminar el turno. No hay `player:updated` de puntaje durante el turno; llega en `turn:end`.
- Ranking: puntaje descendente; en empate, orden de llegada. `rank = 1 + jugadores con puntaje estrictamente mayor` (1, 1, 3).
- `uniqueName`: compara con `normalizeGuess`; si se repite agrega ` 2`, ` 3`…, recortando la base para no pasar el largo máximo.
- `Player.guessed` del contrato es verdadero solo en DRAWING y TURN_END para quienes acertaron en el turno.

## 8. Decisiones sobre casos borde

| Caso | Decisión |
|---|---|
| Dibujante se desconecta en CHOOSING | Se salta su turno al instante, sin TURN_END. Queda gastado en la ronda. |
| Dibujante se desconecta en DRAWING | Fin de turno inmediato con `drawerLeft`; nadie puntúa. Recargar la página le cuesta el turno. |
| Menos de 2 jugadores a mitad de partida | Vuelta a LOBBY cuando una salida o una gracia vencida deja menos de 2 presentes. Los que están en gracia cuentan como presentes. |
| Le toca dibujar a alguien en gracia | No se elige ni se marca. Si vuelve antes de agotarse la ronda, dibuja después. |
| Entra tarde | Adivina de inmediato y, al quedar al final del orden, dibuja al final de la ronda en curso. |
| Todos acertaron | Cuentan solo los conectados, con al menos un acierto. Se revisa también cuando se va un adivinador. |
| El anfitrión se va | El rol se transfiere al borrarse el jugador, no al desconectarse. |
| Quien ya acertó escribe la palabra | Se permite; solo lo ven quienes ya la conocen. |
| Empate | Comparten puesto. |
| Misma sesión en otra pestaña | Gana la última; el `disconnect` del socket viejo se ignora por `connId`. |
| Gracia vencida | Se borra. Si vuelve, entra como jugador nuevo. |
| GAME_END | No tiene plazo. Sale con `start` del anfitrión, que lleva a LOBBY. Si el anfitrión se va, el rol se transfiere como siempre. |
| Chat en CHOOSING | Chat normal para todos, incluido el dibujante. |
| Quién dibuja primero | Orden de llegada, sin azar. |

## 9. Lo que el motor entrega a la red

- `canDraw` como guarda de `stroke:*`, `canvas:undo` y `canvas:clear`.
- El historial de trazos vive en la red, no en el motor: son hasta 30 mensajes por segundo y no deciden ninguna regla. El efecto `strokes:reset` indica cuándo vaciarlo.
- El efecto `snapshot`, al que la red agrega `code` y `strokes` antes de emitir `room:state`.
- `nextWakeAt` para el temporizador único de la sala.

## 10. Pruebas

Arnés (`testing.ts`): `now` controlable, `rng` de secuencia fija, `newId` incremental (`p1`, `p2`…), `pickWords` falso sobre un fixture (`huemul`, `sopaipilla`, `micro` con `la micro`, `mote con huesillo`, `te`…), `dispatch(action)`, `advanceTo(ms)` y registro de efectos. `assertNoWordLeak(effects, word, knowers)`: ningún efecto con un destinatario fuera de `knowers` contiene la palabra normalizada.

**Entrada.** LOBBY inicial con ajustes por defecto; primer `join` es anfitrión y recibe snapshot; sala llena; nombre repetido con sufijo y largo máximo; reconexión en gracia conserva puntaje, puesto y anfitrión; misma sesión ya conectada emite `disconnectConn` e ignora el `disconnect` viejo; reconexión tras la gracia crea jugador nuevo; `sessionId` no aparece en ningún efecto.

**Ajustes e inicio.** Solo anfitrión y solo en LOBBY; fuera de rango; `start` sin ser anfitrión; con menos de 2 conectados; reinicia puntajes; entra en CHOOSING con el primero por llegada.

**Elegir palabra.** `turn:options` solo al dibujante; `not_drawer`; índice inválido; plazo vencido asigna la primera; `chooseWord` tardío da `wrong_phase`; las opciones no se repiten en la partida.

**Dibujo y pistas.** `turn:start` con máscara y `turn:word` solo al dibujante; pistas al 50 % y 75 %; palabra de 3 a 5 letras tiene una pista; de 2 letras, ninguna; no revelan espacios ni se repiten; `nextWakeAt` es el mínimo entre plazo, pista y gracia.

**Intentos.** Acierto con tildes y mayúsculas distintas; con alternativa aceptada; `ano` no acierta `año`; el acierto no emite texto y sí `guess:correct`; quien acierta recibe `turn:word`; distancia 1 emite `guess:close` solo al autor; distancia 2 no; mensaje que contiene la palabra solo llega a su autor; dibujante y quien ya acertó van al canal `guessed`; mensaje vacío no emite; fuera de DRAWING es chat a todos.

**Tiempo.** Primer acierto acorta a 20 s si quedaba más; no alarga si quedaba menos; el segundo no acorta; acortar descarta pistas fuera de plazo; intento tras el plazo es chat de TURN_END.

**Puntaje.** 10, 8, 6, 4, 4; dibujante 10 más 1 por acierto extra; 0 sin aciertos; `drawerLeft` anula el turno; las ganancias de quien se fue se descartan pero su acierto cuenta para el dibujante; se suma recién en TURN_END.

**Fin de turno.** Por tiempo; todos acertaron; un adivinador desconectado no bloquea; dibujante se desconecta en DRAWING; en CHOOSING se salta sin `turn:end`; TURN_END dura 5 s y el turno siguiente emite `strokes:reset`.

**Rondas.** Cada uno dibuja una vez por ronda en orden de llegada; el desconectado se salta y dibuja si vuelve a tiempo; quien entra tarde dibuja al final de la ronda y puede acertar en el turno en curso; tras la última ronda, TURN_END y luego GAME_END.

**Anfitrión y abandono.** El rol pasa al conectado más antiguo al borrarse; desconectarse no lo transfiere; quedar con un jugador vuelve a LOBBY con snapshot; gracia vencida emite `player:left`; `leave` del dibujante en DRAWING con 3 jugadores da `drawerLeft`.

**Fin de partida.** `game:end` ordenado; empates comparten `rank`; GAME_END no vence solo; `start` en GAME_END lleva a LOBBY conservando puntajes; `start` de quien no es anfitrión da `not_host`.

**Fugas y snapshot.** La palabra no llega a un adivinador en ninguna fase de una partida completa; snapshot de adivinador sin palabra ni opciones; snapshot del dibujante en CHOOSING con opciones y en DRAWING con palabra; `canDraw` solo para el dibujante en DRAWING.

**Integral.** Partida de 3 jugadores y 3 rondas con secuencia de fases y puntajes finales exactos.
