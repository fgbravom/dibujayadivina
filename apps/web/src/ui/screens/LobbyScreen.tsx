import {
  DEFAULT_DRAW_SECONDS,
  MAX_DRAW_SECONDS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_DRAW_SECONDS,
  MIN_PLAYERS_TO_START,
  MIN_ROUNDS,
  type ErrorCode,
  type GameSettings,
  type RoomState,
} from '@dya/shared';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { LogoutIcon } from '../components/icons';
import { MessageComposer } from '../components/MessageComposer';
import { MessageFeed } from '../components/MessageFeed';
import { PlayerList } from '../components/PlayerList';
import { ReconnectBanner } from '../components/ReconnectBanner';
import { ShareButton } from '../components/ShareButton';
import { SoundToggle } from '../components/SoundToggle';
import { Stepper } from '../components/Stepper';
import { formatClock } from '../lib/clock';
import { getComposerMode } from '../lib/composer';
import { stepDrawSeconds, stepRounds } from '../lib/settings';
import { roomShareUrl, type ShareEnv } from '../lib/share';
import type { FeedItem } from '../types';

export type LobbyScreenProps = {
  /** Foto de la sala en fase LOBBY. */
  room: RoomState;
  feed: readonly FeedItem[];
  /** `false` muestra el aviso de reconexión y bloquea el chat. */
  connected: boolean;
  /** Enlace a compartir. Por defecto: `${location.origin}/sala/${room.code}`. */
  shareUrl?: string;
  /** Respaldo de compartir inyectable (pruebas). */
  shareEnv?: ShareEnv;
  /** Último `system:error` (por ejemplo `not_enough_players`). */
  error?: ErrorCode | null;
  onDismissError?: () => void;
  /** Solo el anfitrión: recibe los ajustes completos con el cambio aplicado y dentro de rango. */
  onChangeSettings: (settings: GameSettings) => void;
  /** Solo el anfitrión. */
  onStart: () => void;
  onSendMessage: (text: string) => void;
  onLeave: () => void;
};

function defaultShareUrl(code: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return roomShareUrl(code, origin);
}

export function LobbyScreen({
  room,
  feed,
  connected,
  shareUrl,
  shareEnv,
  error = null,
  onDismissError,
  onChangeSettings,
  onStart,
  onSendMessage,
  onLeave,
}: LobbyScreenProps) {
  const isHost = room.selfId === room.hostId;
  const host = room.players.find((p) => p.id === room.hostId);
  const { settings } = room;
  const enoughPlayers = room.players.length >= MIN_PLAYERS_TO_START;
  const missing = MIN_PLAYERS_TO_START - room.players.length;

  return (
    <div className="safe-pad flex min-h-(--app-h) flex-col">
      <ReconnectBanner connected={connected} />
      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 content-start gap-4 px-4 py-5 lg:grid-cols-2 lg:gap-6 lg:py-8">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <header className="max-lg:order-1 flex items-start justify-between gap-3 rounded-2xl border-2 border-ink bg-card p-4 shadow-pop">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-ink-soft">Código de la sala</p>
              <p
                data-testid="room-code"
                aria-label={`Código de la sala: ${room.code.split('').join(' ')}`}
                className="text-5xl font-black leading-none tracking-[0.25em] text-copihue"
              >
                {room.code}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
              <Button
                variant="ghost"
                onClick={onLeave}
                aria-label="Salir de la sala"
                className="-mr-2 shrink-0"
              >
                <LogoutIcon />
                Salir
              </Button>
              <SoundToggle className="shadow-pop-sm" />
            </div>
          </header>

          <section
            aria-labelledby="lobby-players-title"
            className="max-lg:order-3 flex flex-col gap-3 rounded-2xl border-2 border-ink bg-card p-4 shadow-pop"
          >
            <h2
              id="lobby-players-title"
              className="flex items-baseline justify-between text-lg font-black"
            >
              Jugadores
              <span className="text-sm font-extrabold tabular-nums text-ink-soft">
                {room.players.length}/{MAX_PLAYERS}
              </span>
            </h2>
            <PlayerList
              players={room.players}
              selfId={room.selfId}
              drawerId={null}
              phase="LOBBY"
              variant="lobby"
            />
          </section>

          <section
            aria-labelledby="lobby-settings-title"
            className="max-lg:order-4 flex flex-col gap-4 rounded-2xl border-2 border-ink bg-card p-4 shadow-pop"
          >
            <h2 id="lobby-settings-title" className="text-lg font-black">
              Ajustes de la partida
            </h2>
            <Stepper
              label="Rondas"
              valueText={`${settings.rounds} ${settings.rounds === 1 ? 'ronda' : 'rondas'}`}
              readOnly={!isHost}
              canDecrease={settings.rounds > MIN_ROUNDS}
              canIncrease={settings.rounds < MAX_ROUNDS}
              onDecrease={() => onChangeSettings(stepRounds(settings, -1))}
              onIncrease={() => onChangeSettings(stepRounds(settings, 1))}
            />
            <Stepper
              label="Tiempo"
              valueText={formatClock(settings.drawSeconds)}
              readOnly={!isHost}
              canDecrease={settings.drawSeconds > MIN_DRAW_SECONDS}
              canIncrease={settings.drawSeconds < MAX_DRAW_SECONDS}
              onDecrease={() => onChangeSettings(stepDrawSeconds(settings, -1))}
              onIncrease={() => onChangeSettings(stepDrawSeconds(settings, 1))}
            />
            <p className="text-sm font-bold text-ink-soft">
              {isHost
                ? `En cada ronda todos dibujan una vez. Lo normal son 3 rondas de ${formatClock(DEFAULT_DRAW_SECONDS)}.`
                : `Solo ${host?.name ?? 'el anfitrión'} puede cambiar los ajustes.`}
            </p>
          </section>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <section
            aria-label="Invitar y empezar"
            className="max-lg:order-2 flex flex-col gap-3 rounded-2xl border-2 border-ink bg-card p-4 shadow-pop"
          >
            <ErrorNotice error={error} onDismiss={onDismissError} />
            <ShareButton url={shareUrl ?? defaultShareUrl(room.code)} env={shareEnv} />
            {isHost ? (
              <>
                <Button
                  variant="sol"
                  size="lg"
                  onClick={onStart}
                  disabled={!enoughPlayers || !connected}
                  aria-describedby="start-help"
                  data-testid="start-button"
                >
                  ¡Empezar partida!
                </Button>
                <p id="start-help" className="text-center text-sm font-bold text-ink-soft">
                  {enoughPlayers
                    ? 'Todo listo. Cuando quieras, parte el juego.'
                    : `Faltan ${missing} ${missing === 1 ? 'jugador' : 'jugadores'}: se necesitan al menos ${MIN_PLAYERS_TO_START} para empezar. Comparte el enlace.`}
                </p>
              </>
            ) : (
              <p
                data-testid="waiting-for-host"
                className="rounded-xl bg-sol-soft p-3 text-center font-extrabold"
              >
                Esperando a que {host?.name ?? 'el anfitrión'} inicie la partida…
              </p>
            )}
          </section>

          <section
            aria-labelledby="lobby-chat-title"
            className="max-lg:order-5 flex h-72 flex-col overflow-hidden rounded-2xl border-2 border-ink bg-card shadow-pop lg:h-[26rem]"
          >
            <h2
              id="lobby-chat-title"
              className="border-b-2 border-ink px-4 py-2 text-lg font-black"
            >
              Chat
            </h2>
            <MessageFeed items={feed} className="min-h-0 flex-1" />
            <MessageComposer
              mode={getComposerMode({ phase: 'LOBBY', isDrawer: false, hasGuessed: false })}
              onSend={onSendMessage}
              disabled={!connected}
              className="bg-card"
            />
          </section>
        </div>
      </main>
    </div>
  );
}
