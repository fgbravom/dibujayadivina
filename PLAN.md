# Dibuja y Adivina — plan de construcción

Juego web multijugador de dibujar y adivinar, en español de Chile. Una persona dibuja una palabra, el resto la adivina escribiendo, gana quien junta más puntos.

Este documento es la fuente de verdad para los agentes. Cada tarea (T0…T11) está pensada para entregarse a un agente distinto, con archivos propios y criterios de aceptación verificables.

## 1. Alcance

**MVP (lo que cubre este plan)**

- Salas privadas por código o enlace, sin registro: solo se elige un apodo.
- Partida completa con 3 jugadores simultáneos: elegir palabra, dibujar, adivinar, puntaje, rondas, ganador.
- Funciona en desktop y móvil (táctil, vertical), en Chrome, Safari y Firefox actuales.
- Banco de unas 300 palabras chilenas.
- La sala admite hasta 12 jugadores desde el primer día. El MVP solo se *valida* con 3.

**Fuera del MVP** (ver sección 9): salas públicas, cuentas, ranking, moderación, balde de pintura, varias instancias de servidor.

**Identidad propia.** El género es libre, pero nombre, diseño visual, textos y banco de palabras son originales. No se copia la interfaz de ningún juego existente.

## 2. Reglas del juego

| Parámetro | Valor por defecto |
|---|---|
| Jugadores por sala | 2 mínimo para iniciar, 12 máximo |
| Rondas | 3 (en una ronda cada jugador dibuja una vez) |
| Elegir palabra | 3 opciones, 10 s; si no elige, se asigna la primera |
| Tiempo de dibujo | 80 s |
| Tras el primer acierto | el tiempo restante baja a 20 s si quedaba más |
| Pausa entre turnos | 5 s mostrando la palabra y los puntos del turno |

**Estados de la sala**

```
LOBBY → CHOOSING → DRAWING → TURN_END → (siguiente dibujante: CHOOSING)
                                      → (sin más turnos: GAME_END → LOBBY)
```

**El turno termina** cuando se acaba el tiempo, cuando todos adivinaron, o cuando el dibujante se desconecta (en ese caso nadie puntúa).

**Puntaje**

- Adivinadores, según orden de acierto: 10, 8, 6 y 4 para el resto.
- Dibujante: 10 por el primer acierto, +1 por cada acierto adicional. 0 si nadie adivina.

**Pistas.** Todos ven la palabra enmascarada (`_ _ _ _   _ _`, respetando espacios). Se revela una letra al 50 % del tiempo y otra al 75 %, nunca más de un tercio de la palabra.

**Comparación de intentos.** Se normaliza antes de comparar: minúsculas, sin tildes, sin espacios dobles ni puntuación. La `ñ` se conserva (`ano` no es `año`). Cada palabra puede traer alternativas aceptadas (`micro` / `la micro`). Si el intento está a distancia de edición 1, quien escribió recibe un aviso privado de "¡casi!".

**Un solo campo de texto.** No hay chat y campo de respuesta separados:

- Si quien escribe aún no adivina, el mensaje es un intento y lo ven todos.
- Si ya adivinó, o es el dibujante, el mensaje solo lo ven el dibujante y quienes ya adivinaron.
- Un acierto nunca se muestra como texto: aparece "Fulano adivinó".
- En LOBBY, TURN_END y GAME_END es chat normal.

**Anfitrión.** Quien crea la sala la inicia y puede cambiar rondas y tiempo. Si se va, el rol pasa al jugador más antiguo.

**Reconexión.** El navegador guarda un `sessionId`. Si un jugador se cae, conserva su puesto y puntaje durante 30 s. Quien entra a mitad de partida recibe el dibujo en curso y juega desde el turno siguiente como adivinador inmediato.

## 3. Arquitectura

**Decisión central: el servidor manda.** El estado de la partida, el reloj, la palabra y el puntaje viven solo en el servidor. El cliente dibuja lo que el servidor le dice. La palabra secreta nunca viaja a quien no es el dibujante.

| Pieza | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript en todo | Tipos compartidos entre cliente y servidor |
| Repositorio | Monorepo con pnpm workspaces | Un contrato común, tareas paralelas sin choques |
| Cliente | React + Vite + Tailwind + Zustand | Liviano, buen soporte móvil |
| Servidor | Node 22 + Socket.IO | Salas, reconexión y respaldo de transporte ya resueltos |
| Validación | Zod sobre cada mensaje entrante | Nada del cliente se cree sin validar |
| Estado | En memoria, un solo proceso | Suficiente para cientos de salas; sin base de datos en el MVP |
| Pruebas | Vitest (unitarias), Playwright (extremo a extremo) | |
| Despliegue | Un contenedor Docker que sirve API, sockets y el cliente compilado | Un solo origen, sin CORS |

**Estructura**

```
dibujayadivina/
  packages/shared/     contrato: tipos, eventos, esquemas Zod, constantes
  apps/server/
    src/game/          motor de reglas puro (sin red ni relojes reales)
    src/net/           Socket.IO, salas, sesiones, límites de frecuencia
    src/words/         banco de palabras y selector
  apps/web/
    src/canvas/        lienzo y herramientas
    src/ui/            pantallas y componentes
    src/state/         store y cliente de sockets
  e2e/                 pruebas Playwright
```

**Sobre los "más de 10 por sala".** Doce jugadores en una sala no exigen nada especial: el costo real es reenviar trazos, y se controla agrupando puntos (sección 4). El límite del diseño es otro: al haber un solo proceso con estado en memoria, un redespliegue corta las partidas en curso. Es aceptable para el MVP y se resuelve después (sección 9).

## 4. Contrato compartido (`packages/shared`)

Es lo único que todos los agentes leen y nadie modifica por su cuenta después de T0. Si una tarea necesita cambiarlo, el agente se detiene y lo reporta.

**Lienzo.** Espacio lógico fijo de 800 × 600 (4:3), coordenadas enteras. Cada cliente lo escala a su pantalla. Así un trazo se ve igual en un teléfono y en un monitor.

**Trazo**

```ts
type Stroke = {
  id: string;
  color: string;        // uno de PALETTE
  size: 4 | 8 | 16 | 32;
  tool: 'brush' | 'eraser';
  points: number[];     // [x0, y0, x1, y1, ...]
};
```

El cliente del dibujante junta puntos y los envía cada 40 ms. El servidor los reenvía al resto y guarda el historial del turno para quien entre tarde y para deshacer.

**Eventos cliente → servidor**

| Evento | Datos | Quién |
|---|---|---|
| `room:create` | `{ name, sessionId }` | cualquiera |
| `room:join` | `{ code, name, sessionId }` | cualquiera |
| `room:settings` | `{ rounds, drawSeconds }` | anfitrión, en LOBBY |
| `game:start` | — | anfitrión |
| `word:choose` | `{ index }` | dibujante |
| `stroke:start` | `{ id, color, size, tool, points }` | dibujante |
| `stroke:points` | `{ id, points }` | dibujante |
| `stroke:end` | `{ id }` | dibujante |
| `canvas:undo` / `canvas:clear` | — | dibujante |
| `message:send` | `{ text }` | cualquiera |

Las respuestas a `room:create` y `room:join` van por acuse (ack) con `{ ok, error? }`.

**Eventos servidor → cliente**

| Evento | Datos | A quién |
|---|---|---|
| `room:state` | foto completa: jugadores, puntajes, fase, ajustes, trazos, máscara, `endsAt` | quien entra o se reconecta |
| `player:joined` / `player:left` / `player:updated` | jugador | sala |
| `turn:choosing` | `{ drawerId, endsAt }` | sala |
| `turn:options` | `{ words: string[] }` | solo dibujante |
| `turn:start` | `{ drawerId, mask, endsAt, round, totalRounds }` | sala |
| `turn:word` | `{ word }` | solo dibujante |
| `turn:hint` | `{ mask }` | sala |
| `turn:timer` | `{ endsAt }` | sala (al acortarse el tiempo) |
| `turn:end` | `{ word, gains, scores, reason }` | sala |
| `game:end` | `{ ranking }` | sala |
| `stroke:*`, `canvas:*` | igual que los entrantes | sala menos el dibujante |
| `message:new` | `{ playerId, text, channel: 'all' \| 'guessed' }` | según canal |
| `guess:correct` | `{ playerId }` | sala |
| `guess:close` | — | solo quien escribió |
| `system:error` | `{ code }` | quien lo causó |

**Reloj.** El servidor envía `endsAt` como tiempo de servidor. `room:state` incluye `serverNow` para que el cliente calcule el desfase y muestre la cuenta regresiva sin recibir un mensaje por segundo.

**Límites** (constantes exportadas): apodo 2–16 caracteres, mensaje hasta 80, hasta 64 puntos por mensaje, hasta 30 mensajes de trazo y 3 de texto por segundo y jugador, hasta 2.000 trazos por turno.

## 5. Tareas

Cada tarea indica el tipo de agente sugerido, sus archivos y cómo se comprueba. Las de una misma ola se ejecutan en paralelo porque no comparten archivos.

### Ola 0 — base (un agente, en serie)

**T0. Andamiaje y contrato** · agente: `ejecutor`

- `git init`, monorepo pnpm, TypeScript estricto, ESLint, Prettier, Vitest.
- `packages/shared` con todo lo de la sección 4: tipos, nombres de eventos, esquemas Zod, constantes, y las funciones `normalizeGuess` y `maskWord` con pruebas.
- `apps/server` y `apps/web` vacías pero que arrancan; `pnpm dev` levanta ambas.
- Listo cuando: `pnpm install && pnpm typecheck && pnpm test && pnpm dev` funcionan en limpio, y el cliente muestra una página que confirma conexión por socket con el servidor.

### Ola 1 — piezas independientes (cuatro agentes en paralelo)

**T1. Motor de reglas** · agente: `ejecutor` · archivos: `apps/server/src/game/**`

- Máquina de estados pura: recibe acciones (`join`, `leave`, `start`, `chooseWord`, `guess`, `tick`, …) y devuelve nuevo estado más una lista de efectos a emitir. Sin Socket.IO, sin `setTimeout`: el reloj y el azar se inyectan.
- Cubre todo lo de la sección 2: orden de turnos, puntaje, acortar el tiempo, pistas, fin de turno, cambio de anfitrión, salida del dibujante, entrada tardía.
- Listo cuando: las pruebas unitarias simulan una partida completa de 3 jugadores y 3 rondas, y cubren cada causa de fin de turno, el caso "casi", que la palabra no aparezca en ningún efecto dirigido a un adivinador, y que quedar con un solo jugador devuelva la sala a LOBBY.

**T2. Banco de palabras** · agente: `barrido` · archivos: `apps/server/src/words/**`

- `words.json` con unas 300 entradas: `{ text, category, difficulty: 1|2|3, accept?: string[] }`.
- Categorías: comida (completo, sopaipilla, mote con huesillo), lugares (Torres del Paine, Valparaíso), animales y naturaleza (huemul, cóndor, copihue), cultura y fiestas (cueca, fonda, volantín), chilenismos y vida diaria (micro, guata, polera), y objetos comunes.
- Criterio de inclusión: que se pueda dibujar. Sin insultos, sin personas reales, sin marcas.
- `pickOptions(usadas, n)` entrega opciones sin repetir dentro de la partida y mezclando dificultades.
- Listo cuando: una prueba valida el esquema, que no haya duplicados tras normalizar, y que `pickOptions` no repita.

**T3. Lienzo** · agente: `ejecutor` · archivos: `apps/web/src/canvas/**`

- Componente `<DrawingCanvas>` con dos modos: dibujante (captura) y espectador (solo pinta).
- Pointer Events para mouse, dedo y lápiz; `touch-action: none`; nitidez según `devicePixelRatio`; trazos suavizados.
- Interfaz por props y callbacks (`onStrokeStart`, `onStrokePoints`, `onStrokeEnd`) y métodos para aplicar trazos remotos, deshacer, limpiar y cargar un historial. No conoce los sockets.
- Barra de herramientas: 12 colores, 4 grosores, goma, deshacer, limpiar. Botones de 44 px como mínimo.
- Listo cuando: una página de demostración muestra dos lienzos lado a lado, lo dibujado en uno se replica en el otro a través de los callbacks, y funciona con emulación táctil. Pruebas unitarias del agrupado de puntos y del escalado de coordenadas.

**T4. Pantallas** · agente: `ejecutor` · archivos: `apps/web/src/ui/**`

- Inicio (apodo, crear sala, unirse con código), sala de espera (jugadores, ajustes, botón compartir enlace, iniciar), partida, y fin de partida (podio, jugar de nuevo).
- Partida en desktop: jugadores a la izquierda, lienzo al centro, mensajes a la derecha. En móvil vertical: cabecera con reloj, máscara y ronda; lienzo a todo el ancho; herramientas; mensajes; campo de texto fijo abajo; jugadores en una fila compacta.
- El teclado del teléfono no debe tapar el campo de texto ni el lienzo completo: usar `100dvh` y `visualViewport`.
- Textos en español de Chile, cercanos y sin groserías. Diseño visual propio.
- Trabaja con estado simulado; el lienzo entra como un hueco que T6 rellena.
- Listo cuando: todas las pantallas y fases se pueden recorrer con datos simulados en 360 × 640 y en 1280 × 800, sin desplazamiento horizontal.

### Ola 2 — red (dos agentes en paralelo)

**T5. Servidor de sockets** · agente: `ejecutor` · depende de T1, T2 · archivos: `apps/server/src/net/**`, `apps/server/src/index.ts`

- Registro de salas con códigos de 4 letras sin caracteres ambiguos; se borran al quedar vacías 60 s.
- Conecta los eventos con el motor: valida con Zod, verifica el rol de quien envía, aplica la acción y emite los efectos a los destinatarios correctos. Maneja los temporizadores reales.
- Reenvío de trazos con historial por turno, sesiones con 30 s de gracia, límites de frecuencia, saneado de apodos (sin repetidos en la sala).
- Sirve el cliente compilado y expone `/health`.
- Listo cuando: una prueba de integración con tres clientes `socket.io-client` juega una partida completa con tiempos acortados, y comprueba que la palabra solo llega al dibujante, que un no dibujante no puede enviar trazos, y que quien se reconecta recibe el estado y el dibujo.

**T6. Cliente conectado** · agente: `ejecutor` · depende de T3, T4 · archivos: `apps/web/src/state/**`, más el cableado en `apps/web/src/App.tsx`

- Store con Zustand alimentado por los eventos; cliente de sockets tipado con el contrato.
- Reemplaza el estado simulado de T4 y monta el lienzo de T3.
- Ruta `/sala/:code` para entrar por enlace; `sessionId` en `localStorage`; aviso de reconexión; cuenta regresiva local a partir de `endsAt`.
- Listo cuando: funciona contra el servidor de T5. Mientras T5 no esté, se desarrolla contra un servidor simulado que implementa el contrato.

### Ola 3 — verificación (dos agentes en paralelo)

**T7. Pruebas extremo a extremo** · agente: `ejecutor` · archivos: `e2e/**`

- Playwright con tres contextos de navegador, uno de ellos con tamaño y táctil de teléfono.
- Escenario principal: A crea la sala, B y C entran por enlace, A inicia, el dibujante elige y dibuja, uno adivina (se acorta el reloj), otro falla, se muestran puntos, avanza el turno, termina la partida con podio.
- Escenarios adicionales: recargar la página a mitad de turno y recuperar dibujo y puntaje; el dibujante cierra la pestaña; un cuarto jugador entra tarde.
- El servidor acepta por variable de entorno tiempos cortos y palabra fija para que las pruebas sean deterministas.
- Listo cuando: `pnpm e2e` pasa tres veces seguidas.

**T8. Pulido móvil y accesibilidad** · agente: `ejecutor` · archivos: los de T3 y T4

- Revisión en Safari de iOS y Chrome de Android (reales o emulados): teclado, rebote de desplazamiento, zoom por doble toque, giro de pantalla, zonas seguras.
- Contraste, foco visible, etiquetas en botones de solo ícono.
- Listo cuando: lista de comprobación documentada y sin problemas abiertos que impidan jugar.

### Ola 4 — salida (en serie)

**T9. Revisión** · agentes: revisión de código y de seguridad, con contexto limpio

- Foco: fuga de la palabra secreta, mensajes sin validar, acciones sin verificar rol, crecimiento sin tope de memoria (salas, trazos, sesiones), contenido de usuario insertado como HTML.
- Listo cuando: los hallazgos confirmados están corregidos y con prueba.

**T10. Despliegue** · agente: `ejecutor`

- `Dockerfile` de varias etapas y configuración de la plataforma. Requisitos: WebSockets persistentes, una sola instancia, HTTPS. Candidatas: Fly.io (comprobar si su región de Santiago está disponible, por latencia), Railway o Render.
- Listo cuando: tres personas en redes distintas, al menos una desde un teléfono con datos móviles, juegan una partida completa en la URL pública.

**T11. Prueba con gente** · la hace una persona, no un agente

- Una partida real con 3 jugadores y otra con 10 o más para confirmar el objetivo de escala. Anotar lo que confunde o molesta; eso define la siguiente iteración.

## 6. Orden y dependencias

```
T0 ──┬─ T1 ─┐
     ├─ T2 ─┴─ T5 ─┐
     ├─ T3 ─┐      ├─ T7 ─┐
     └─ T4 ─┴─ T6 ─┴─ T8 ─┴─ T9 ─ T10 ─ T11
```

Máximo cuatro agentes a la vez (ola 1). T0 no se paraleliza: de su contrato depende que el resto no choque.

## 7. Reglas para todos los agentes

1. Leer este plan y `packages/shared` antes de escribir código.
2. Tocar solo los archivos de la tarea. Si hace falta cambiar el contrato o un archivo ajeno, detenerse y reportarlo en vez de hacerlo.
3. Las reglas del juego viven en el motor (T1). Ni la capa de red ni el cliente deciden puntajes o aciertos.
4. Nada que llegue del cliente se usa sin pasar por Zod y por la verificación de rol.
5. Identificadores de código en inglés; textos de interfaz en español de Chile.
6. Terminar con `pnpm typecheck && pnpm lint && pnpm test` en verde y reportar: qué se hizo, qué no, y qué se asumió.
7. Commits con Conventional Commits en español, un propósito por commit.

**Plantilla de encargo**

```
Tarea: T<n> de PLAN.md (léelo completo, en especial las secciones 2, 4 y 7).
Archivos tuyos: <rutas>. No modifiques nada fuera de ellas.
Ya existe: <tareas terminadas y dónde quedó su resultado>.
Listo cuando: <criterios de la tarea>.
Al terminar, reporta qué hiciste, qué quedó pendiente y qué asumiste.
```

## 8. Riesgos

| Riesgo | Cómo se controla |
|---|---|
| El dibujo se ve distinto en cada pantalla | Espacio lógico fijo de 800 × 600 y escalado en el cliente |
| Trazos con retraso o a saltos en redes móviles | Envío agrupado cada 40 ms, mensajes pequeños, suavizado al pintar |
| Trampa leyendo el tráfico | La palabra solo viaja al dibujante; los aciertos se validan en el servidor |
| El dibujante escribe la palabra en el lienzo | No se puede impedir con código; queda para la votación de expulsión posterior |
| Teclado del teléfono tapa el juego | Diseño con `100dvh` y `visualViewport`, verificado en T8 |
| Un redespliegue corta partidas | Aceptado en el MVP; desplegar en horas sin uso |
| Agentes en paralelo se pisan | Archivos propios por tarea y contrato congelado tras T0 |

## 9. Después del MVP

En orden sugerido:

1. Salas públicas con listado y entrada rápida.
2. Expulsión por votación, filtro de groserías y reporte de dibujos.
3. Balde de pintura, más colores, reacciones al dibujo.
4. Categorías elegibles y listas de palabras propias por sala.
5. Sonidos y animaciones de acierto.
6. Cuentas opcionales, estadísticas y ranking.
7. Varias instancias: estado de sala en Redis o salas fijadas a una instancia, y redespliegue sin cortar partidas.

## 10. Decisiones abiertas

Tienen valor por defecto, así que no frenan el trabajo. Conviene confirmarlas antes de T4 y T10.

| Decisión | Valor asumido |
|---|---|
| Nombre público | "Dibuja y Adivina" (provisional, el de la carpeta) |
| Tono de las palabras | Familiar, sin groserías ni doble sentido |
| Plataforma de despliegue | Fly.io si hay región en Santiago; si no, Railway |
| Máximo por sala | 12 |
