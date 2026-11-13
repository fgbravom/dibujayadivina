import { Fragment, useEffect, type MouseEvent, type ReactNode } from 'react';
import type { Phase, RoomState } from '@dya/shared';
import { ChoosingPanel } from '../components/ChoosingPanel';
import { ClockBadge } from '../components/ClockBadge';
import { LogoutIcon } from '../components/icons';
import { MessageComposer } from '../components/MessageComposer';
import { MessageFeed } from '../components/MessageFeed';
import { PlayerList } from '../components/PlayerList';
import { ReconnectBanner } from '../components/ReconnectBanner';
import { TurnEndPanel } from '../components/TurnEndPanel';
import { WordDisplay } from '../components/WordDisplay';
import { useCountdown } from '../hooks/useCountdown';
import { DESK_QUERY, LAND_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { turnAnnouncement } from '../lib/announce';
import { getComposerMode } from '../lib/composer';
import { letterCount, parseMask, symbolsFromWord } from '../lib/mask';
import { turnEndReasonText } from '../lib/turnEnd';
import type { FeedItem } from '../types';

export type GameScreenProps = {
  /** Foto de la sala en fase CHOOSING, DRAWING o TURN_END. */
  room: RoomState;
  feed: readonly FeedItem[];
  /** `false` muestra el aviso de reconexión y bloquea el campo de texto. */
  connected: boolean;
  /** `serverNow - Date.now()` medido al recibir `room:state` (ver `computeServerOffset`). */
  serverOffsetMs: number;
  /**
   * Hueco del lienzo. Se monta dentro de un marco 4:3 que ya tiene el tamaño exacto: el contenido
   * debe ocupar el 100 % de ancho y alto. Permanece montado en todas las fases (en CHOOSING y
   * TURN_END queda tapado por un panel).
   */
  canvasSlot: ReactNode;
  /**
   * Hueco de la barra de herramientas. Solo se muestra al dibujante durante DRAWING; para el
   * resto no se renderiza aunque se pase. El dibujante conserva su sitio (invisible) durante
   * CHOOSING y TURN_END para que el diseño no salte.
   */
  toolbarSlot?: ReactNode;
  /** El dibujante eligió la opción `index` (0 a 2) de `room.wordOptions`. */
  onChooseWord: (index: number) => void;
  onSendMessage: (text: string) => void;
  /** Si se pasa, aparece el botón "Salir". La confirmación (si la hay) es cosa de quien lo conecta. */
  onLeave?: () => void;
};

type HeaderProps = {
  phase: Phase;
  isDrawer: boolean;
  drawerName: string;
  /** Palabra visible: la real (dibujante) o la revelada (TURN_END). */
  visibleWord: string | null;
  mask: string | null;
  round: number;
  totalRounds: number;
  seconds: number | null;
  urgent: boolean;
  /** Poco alto disponible (teclado abierto, teléfono apaisado): se suelta la etiqueta pequeña. */
  compact: boolean;
};

/** Tamaño de la palabra en la cabecera: las largas ("mote con huesillo") bajan de tamaño para no partirse. */
function wordSizeClass(letters: number): string {
  if (letters > 18) return 'text-xs sm:text-base';
  if (letters > 11) return 'text-sm sm:text-lg';
  return 'text-base sm:text-xl';
}

function GameHeader({
  phase,
  isDrawer,
  drawerName,
  visibleWord,
  mask,
  round,
  totalRounds,
  seconds,
  urgent,
  compact,
}: HeaderProps) {
  let label: string;
  let body: ReactNode;
  // Palabra de varias líneas (más de 11 letras): sin la etiqueta de arriba la cabecera conserva el
  // mismo alto en todas las fases y el diseño no salta.
  let longWord = false;
  if (phase === 'CHOOSING') {
    label = isDrawer ? 'Es tu turno' : 'Siguiente dibujante';
    body = (
      <p className="max-w-full truncate text-base font-black sm:text-lg">
        {isDrawer ? 'Elige tu palabra' : `${drawerName} está eligiendo`}
      </p>
    );
  } else if (phase === 'TURN_END') {
    label = 'La palabra era';
    longWord = visibleWord !== null && letterCount(symbolsFromWord(visibleWord)) > 11;
    body = visibleWord ? (
      <WordDisplay
        word={visibleWord}
        className={wordSizeClass(letterCount(symbolsFromWord(visibleWord)))}
      />
    ) : (
      <p className="text-base font-black">Fin del turno</p>
    );
  } else if (isDrawer && visibleWord) {
    label = 'Dibuja esto';
    longWord = letterCount(symbolsFromWord(visibleWord)) > 11;
    body = (
      <WordDisplay
        word={visibleWord}
        className={wordSizeClass(letterCount(symbolsFromWord(visibleWord)))}
      />
    );
  } else if (mask) {
    const letters = letterCount(parseMask(mask));
    label = `Adivina · ${letters} ${letters === 1 ? 'letra' : 'letras'}`;
    longWord = letters > 11;
    body = <WordDisplay mask={mask} className={wordSizeClass(letters)} />;
  } else {
    label = 'Adivina';
    body = <p className="text-base font-black">…</p>;
  }

  return (
    <header
      data-testid="game-header"
      className={`flex shrink-0 items-center gap-2 border-b-2 border-ink bg-card px-3 land:min-h-0 land:pb-1 land:pt-[max(0.25rem,env(safe-area-inset-top))] desk:gap-4 desk:px-4 ${
        compact
          ? 'min-h-0 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))]'
          : 'min-h-[3.75rem] pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]'
      }`}
    >
      <ClockBadge seconds={seconds} urgent={urgent} />
      <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
        <span
          className={`text-[0.7rem] font-extrabold uppercase tracking-wide text-ink-soft sm:text-xs ${compact || longWord ? 'hidden desk:block' : ''}`}
        >
          {label}
        </span>
        {body}
      </div>
      <div
        data-testid="round-chip"
        className="flex shrink-0 flex-col items-center rounded-xl border-2 border-ink bg-mar-soft px-2 py-0.5 leading-tight"
      >
        <span className="text-[0.65rem] font-extrabold uppercase tracking-wide text-ink-soft">
          Ronda
        </span>
        <span className="text-sm font-black tabular-nums">
          {round}/{totalRounds}
        </span>
      </div>
    </header>
  );
}

/** Sin menú contextual al mantener presionado (táctil), salvo en campos de texto y mensajes. */
function suppressLongPressMenu(event: MouseEvent<HTMLElement>): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, [data-selectable]'))
    return;
  event.preventDefault();
}

export function GameScreen({
  room,
  feed,
  connected,
  serverOffsetMs,
  canvasSlot,
  toolbarSlot,
  onChooseWord,
  onSendMessage,
  onLeave,
}: GameScreenProps) {
  const { compact, keyboardOpen, height: viewportHeight } = useVisualViewport();
  const landscape = useMediaQuery(LAND_QUERY);
  const desk = useMediaQuery(DESK_QUERY);
  const { seconds, urgent } = useCountdown(room.endsAt, serverOffsetMs);

  // Mientras se juega, la página no se desplaza ni rebota: todo cabe en la pantalla.
  useEffect(() => {
    document.documentElement.classList.add('game-lock');
    return () => document.documentElement.classList.remove('game-lock');
  }, []);

  const self = room.players.find((p) => p.id === room.selfId);
  const drawer = room.players.find((p) => p.id === room.drawerId);
  const isDrawer = room.selfId === room.drawerId;
  const hasGuessed = self?.guessed ?? false;
  const drawerName = drawer?.name ?? 'Alguien';
  const mode = getComposerMode({ phase: room.phase, isDrawer, hasGuessed });
  const toolbarActive = Boolean(toolbarSlot) && isDrawer && room.phase === 'DRAWING';
  // El dibujante conserva el sitio de la barra durante todo su turno (invisible fuera de DRAWING)
  // para que el diseño no salte al elegir la palabra ni al terminar el turno.
  const toolbarReserved = Boolean(toolbarSlot) && isDrawer;

  // Teléfono vertical con el teclado abierto (o muy poco alto): se sueltan adornos para que
  // quepan el dibujo, el último mensaje y el campo de texto.
  const squeezed = !landscape && !desk && (keyboardOpen || compact);
  // Apaisado con teclado: no caben ni las fichas de jugadores ni la barra vertical.
  const tooShort = landscape && viewportHeight !== null && viewportHeight < 300;
  const hideChips = squeezed || tooShort;

  const visibleWord = room.phase === 'TURN_END' ? (room.turnEnd?.word ?? null) : room.word;
  const announcement = turnAnnouncement({
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    isDrawer,
    drawerName,
    word: visibleWord,
    mask: room.mask,
    endReason:
      room.phase === 'TURN_END' && room.turnEnd ? turnEndReasonText(room.turnEnd.reason) : null,
  });

  return (
    <div
      data-testid="game-screen"
      data-phase={room.phase}
      onContextMenu={suppressLongPressMenu}
      className="fixed inset-x-0 top-(--app-top) flex h-(--app-h) select-none flex-col overflow-hidden bg-paper pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
    >
      <ReconnectBanner connected={connected} />
      {/* Única voz de los cambios de turno para lectores de pantalla; los aciertos los anuncia la lista de mensajes. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <GameHeader
        phase={room.phase}
        isDrawer={isDrawer}
        drawerName={drawerName}
        visibleWord={visibleWord}
        mask={room.mask}
        round={room.round}
        totalRounds={room.totalRounds}
        seconds={seconds}
        urgent={urgent}
        compact={squeezed || landscape}
      />

      <div className="flex min-h-0 flex-1 flex-col land:grid land:grid-cols-[minmax(0,1fr)_clamp(14rem,36vw,20rem)] land:grid-rows-[auto_minmax(0,1fr)] desk:grid desk:grid-cols-[17rem_minmax(0,1fr)_21rem] desk:grid-rows-[minmax(0,1fr)] desk:gap-4 desk:p-4">
        {/* Móvil: fila compacta de fichas (en apaisado, arriba de los mensajes). Se oculta con el teclado abierto. */}
        {!hideChips && (
          <div className="flex shrink-0 items-center border-b-2 border-ink bg-paper-deep land:col-start-2 land:row-start-1 land:border-l-2 desk:hidden">
            <PlayerList
              players={room.players}
              selfId={room.selfId}
              drawerId={room.drawerId}
              phase={room.phase}
              variant="chips"
              className="min-w-0 flex-1"
            />
            {onLeave && (
              <button
                type="button"
                onClick={onLeave}
                aria-label="Salir de la sala"
                className="mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-card"
              >
                <LogoutIcon />
              </button>
            )}
          </div>
        )}

        {/* Escritorio: jugadores a la izquierda. */}
        <aside className="hidden min-h-0 flex-col gap-3 desk:flex">
          <h2 className="text-lg font-black">Jugadores</h2>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <PlayerList
              players={room.players}
              selfId={room.selfId}
              drawerId={room.drawerId}
              phase={room.phase}
              variant="column"
            />
          </div>
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-4 font-extrabold shadow-pop-sm hover:bg-sol-soft"
            >
              <LogoutIcon /> Salir de la sala
            </button>
          )}
        </aside>

        {/* Centro: lienzo y herramientas (en apaisado, la barra queda a la izquierda del lienzo). */}
        <main className="flex min-h-0 shrink flex-col land:col-start-1 land:row-span-2 land:row-start-1 land:flex-row-reverse land:items-stretch land:gap-2 land:p-2 desk:gap-2 desk:p-0">
          <div className="canvas-area shrink">
            <div className="canvas-frame overflow-hidden bg-white shadow-[0_-2px_0_0_var(--color-ink),0_2px_0_0_var(--color-ink)] land:rounded-lg land:border-2 land:border-ink land:shadow-none desk:rounded-xl desk:border-2 desk:border-ink desk:shadow-pop">
              <div
                className="absolute inset-0"
                aria-hidden={room.phase !== 'DRAWING' ? true : undefined}
              >
                {canvasSlot}
              </div>
              {room.phase === 'CHOOSING' && (
                <div className="absolute inset-0 bg-paper/95">
                  <ChoosingPanel
                    isDrawer={isDrawer}
                    drawerId={room.drawerId}
                    drawerName={drawerName}
                    wordOptions={room.wordOptions}
                    onChoose={onChooseWord}
                  />
                </div>
              )}
              {room.phase === 'TURN_END' && room.turnEnd && (
                <div className="absolute inset-0 bg-paper/95">
                  <TurnEndPanel
                    turnEnd={room.turnEnd}
                    players={room.players}
                    drawerId={room.drawerId}
                    secondsToNext={seconds}
                  />
                </div>
              )}
            </div>
          </div>
          {toolbarReserved && (
            <div
              data-testid="toolbar-slot"
              inert={!toolbarActive}
              // Con el teclado abierto se oculta (sin desmontarla, para no perder su estado); fuera de
              // DRAWING solo guarda el sitio.
              className={`shrink-0 px-2 py-1 land:flex land:items-center land:px-0 land:py-0 desk:block desk:px-0 desk:py-0 ${
                squeezed || tooShort ? 'hidden' : ''
              } ${toolbarActive ? '' : 'invisible'}`}
            >
              {/* Con la ronda o el dibujante nuevos la barra se monta de cero: sin paneles abiertos. */}
              <Fragment key={`${room.round}:${room.drawerId}`}>{toolbarSlot}</Fragment>
            </div>
          )}
        </main>

        {/* Derecha en escritorio y apaisado / abajo en móvil vertical: mensajes y campo de texto. */}
        <section
          aria-label="Mensajes"
          className={`flex flex-1 flex-col land:col-start-2 land:row-start-2 land:min-h-0 land:border-l-2 land:border-ink land:bg-card desk:min-h-0 desk:overflow-hidden desk:rounded-2xl desk:border-2 desk:border-ink desk:bg-card desk:shadow-pop ${
            squeezed ? 'min-h-[calc(3.5rem+4rem)]' : 'min-h-[calc(7rem+4rem)]'
          }`}
        >
          <MessageFeed items={feed} className="min-h-0 flex-1" />
          <MessageComposer
            mode={mode}
            onSend={onSendMessage}
            disabled={!connected}
            keyboardOpen={keyboardOpen}
            className="bg-paper land:bg-card desk:bg-card"
          />
        </section>
      </div>
    </div>
  );
}
