import type { ReactNode } from 'react';
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
import { useVisualViewport } from '../hooks/useVisualViewport';
import { getComposerMode } from '../lib/composer';
import { parseMask, letterCount } from '../lib/mask';
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
   * resto no se renderiza aunque se pase.
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
  /** Poco alto disponible (teclado abierto): se suelta la etiqueta pequeña. */
  compact: boolean;
};

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
  if (phase === 'CHOOSING') {
    label = isDrawer ? 'Es tu turno' : 'Siguiente dibujante';
    body = (
      <p className="text-base font-black sm:text-lg">
        {isDrawer ? 'Elige tu palabra' : `${drawerName} está eligiendo`}
      </p>
    );
  } else if (phase === 'TURN_END') {
    label = 'La palabra era';
    body = visibleWord ? (
      <WordDisplay word={visibleWord} className="text-base sm:text-xl" />
    ) : (
      <p className="text-base font-black">Fin del turno</p>
    );
  } else if (isDrawer && visibleWord) {
    label = 'Dibuja esto';
    body = <WordDisplay word={visibleWord} className="text-base sm:text-xl" />;
  } else if (mask) {
    const letters = letterCount(parseMask(mask));
    label = `Adivina · ${letters} ${letters === 1 ? 'letra' : 'letras'}`;
    body = <WordDisplay mask={mask} className="text-base sm:text-xl" />;
  } else {
    label = 'Adivina';
    body = <p className="text-base font-black">…</p>;
  }

  return (
    <header
      data-testid="game-header"
      className="flex shrink-0 items-center gap-2 border-b-2 border-ink bg-card px-3 py-2 lg:gap-4 lg:px-4"
    >
      <ClockBadge seconds={seconds} urgent={urgent} />
      <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
        <span
          className={`text-[0.7rem] font-extrabold uppercase tracking-wide text-ink-soft sm:text-xs ${compact ? 'hidden lg:block' : ''}`}
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
  const { compact } = useVisualViewport();
  const { seconds, urgent } = useCountdown(room.endsAt, serverOffsetMs);

  const self = room.players.find((p) => p.id === room.selfId);
  const drawer = room.players.find((p) => p.id === room.drawerId);
  const isDrawer = room.selfId === room.drawerId;
  const hasGuessed = self?.guessed ?? false;
  const drawerName = drawer?.name ?? 'Alguien';
  const mode = getComposerMode({ phase: room.phase, isDrawer, hasGuessed });
  const showToolbar = Boolean(toolbarSlot) && isDrawer && room.phase === 'DRAWING';

  const visibleWord = room.phase === 'TURN_END' ? (room.turnEnd?.word ?? null) : room.word;

  return (
    <div
      data-testid="game-screen"
      data-phase={room.phase}
      className="fixed inset-x-0 top-(--app-top) flex h-(--app-h) flex-col overflow-hidden bg-paper"
    >
      <ReconnectBanner connected={connected} />
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
        compact={compact}
      />

      {/* Móvil: fila compacta de fichas. Se oculta con el teclado abierto para dejar sitio. */}
      {!compact && (
        <div className="flex shrink-0 items-center border-b-2 border-ink bg-paper-deep lg:hidden">
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

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[17rem_minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-4 lg:p-4">
        {/* Escritorio: jugadores a la izquierda. */}
        <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
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

        {/* Centro: lienzo y herramientas. */}
        <main className="flex min-h-0 shrink flex-col gap-2">
          <div className="canvas-area shrink">
            <div className="canvas-frame overflow-hidden border-y-2 border-ink bg-white lg:rounded-xl lg:border-2 lg:shadow-pop">
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
          {showToolbar && (
            <div
              data-testid="toolbar-slot"
              // Con el teclado abierto se oculta (sin desmontarla, para no perder su estado).
              className={`shrink-0 px-2 pb-1 lg:block lg:px-0 lg:pb-0 ${compact ? 'hidden' : ''}`}
            >
              {toolbarSlot}
            </div>
          )}
        </main>

        {/* Derecha en escritorio / abajo en móvil: mensajes y campo de texto. */}
        <section
          aria-label="Mensajes"
          className={`flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden lg:rounded-2xl lg:border-2 lg:border-ink lg:bg-card lg:shadow-pop ${compact ? 'min-h-28' : 'min-h-[7.5rem]'}`}
        >
          <MessageFeed items={feed} className="min-h-0 flex-1" />
          <MessageComposer
            mode={mode}
            onSend={onSendMessage}
            disabled={!connected}
            className="bg-paper lg:bg-card"
          />
        </section>
      </div>
    </div>
  );
}
