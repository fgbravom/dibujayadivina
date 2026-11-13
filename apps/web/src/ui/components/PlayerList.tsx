import type { Phase, Player } from '@dya/shared';
import { rankByScore } from '../lib/ranking';
import { Avatar } from './Avatar';
import { CheckIcon, CrownIcon, PencilIcon } from './icons';

type PlayerListProps = {
  players: readonly Player[];
  selfId: string;
  /** Quien dibuja en el turno en curso; `null` si no hay. */
  drawerId: string | null;
  phase: Phase;
  /**
   * `column`: lista vertical con puesto y puntaje (escritorio, partida).
   * `chips`: fila compacta que se desplaza de lado (móvil, partida).
   * `lobby`: lista vertical de la sala de espera, en orden de llegada y con anfitrión.
   */
  variant: 'column' | 'chips' | 'lobby';
  className?: string;
};

type Status = { label: string; icon: 'pencil' | 'check' | null };

function statusOf(player: Player, drawerId: string | null, phase: Phase): Status | null {
  if (!player.connected) return { label: 'sin conexión', icon: null };
  if (phase === 'DRAWING' || phase === 'TURN_END') {
    if (player.id === drawerId) return { label: 'dibuja', icon: 'pencil' };
    if (player.guessed) return { label: 'adivinó', icon: 'check' };
  }
  if (phase === 'CHOOSING' && player.id === drawerId)
    return { label: 'elige palabra', icon: 'pencil' };
  return null;
}

function StatusBadge({ status }: { status: Status | null }) {
  if (!status?.icon) return null;
  const tone = status.icon === 'pencil' ? 'bg-sol text-ink' : 'bg-pasto text-white';
  return (
    <span
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-ink ${tone}`}
    >
      {status.icon === 'pencil' ? (
        <PencilIcon width="0.9em" height="0.9em" />
      ) : (
        <CheckIcon width="0.9em" height="0.9em" />
      )}
    </span>
  );
}

function ScreenReaderStatus({
  player,
  status,
  selfId,
}: {
  player: Player;
  status: Status | null;
  selfId: string;
}) {
  const parts = [
    player.id === selfId ? 'tú' : null,
    player.isHost ? 'anfitrión' : null,
    status?.label ?? null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className="sr-only"> ({parts.join(', ')})</span>;
}

export function PlayerList({
  players,
  selfId,
  drawerId,
  phase,
  variant,
  className = '',
}: PlayerListProps) {
  const ordered =
    variant === 'lobby' ? players.map((player) => ({ player, rank: 0 })) : rankByScore(players);

  if (variant === 'chips') {
    return (
      <ul
        aria-label="Jugadores"
        data-testid="player-chips"
        className={`relative flex gap-2 overflow-x-auto px-3 py-1 ${className}`}
      >
        {ordered.map(({ player }) => {
          const status = statusOf(player, drawerId, phase);
          const highlight =
            player.id === drawerId && phase !== 'LOBBY'
              ? 'bg-sol-soft'
              : player.guessed && phase === 'DRAWING'
                ? 'bg-pasto-soft'
                : 'bg-card';
          return (
            <li
              key={player.id}
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-ink py-0.5 pl-1.5 pr-2.5 ${highlight} ${player.connected ? '' : 'opacity-60'}`}
            >
              <Avatar id={player.id} name={player.name} size="sm" />
              <span className="flex flex-col leading-tight">
                <span className="max-w-[5.5rem] truncate text-sm font-extrabold">
                  {player.name}
                  <ScreenReaderStatus player={player} status={status} selfId={selfId} />
                </span>
                <span className="text-xs font-bold tabular-nums text-ink-soft">
                  {player.score} pts
                </span>
              </span>
              <StatusBadge status={status} />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ol
      aria-label="Jugadores"
      data-testid={variant === 'lobby' ? 'lobby-players' : 'player-column'}
      className={`relative ${variant === 'lobby' ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'flex flex-col gap-2'} ${className}`}
    >
      {ordered.map(({ player, rank }) => {
        const status = statusOf(player, drawerId, phase);
        const subline = [
          player.id === selfId ? 'Tú' : null,
          player.isHost ? 'Anfitrión' : null,
          !player.connected ? 'Sin conexión' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const highlight =
          variant === 'column' && player.id === drawerId
            ? 'bg-sol-soft'
            : variant === 'column' && player.guessed && phase === 'DRAWING'
              ? 'bg-pasto-soft'
              : 'bg-card';
        return (
          <li
            key={player.id}
            className={`flex min-h-12 items-center gap-2 rounded-xl border-2 border-ink px-2.5 py-1.5 ${highlight} ${player.connected ? '' : 'opacity-60'}`}
          >
            {variant === 'column' && (
              <span className="w-4 shrink-0 text-center text-sm font-black tabular-nums text-ink-soft">
                {rank}
              </span>
            )}
            <Avatar id={player.id} name={player.name} />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-extrabold">
                {player.name}
                <ScreenReaderStatus player={player} status={status} selfId={selfId} />
              </span>
              {subline && (
                <span
                  aria-hidden="true"
                  className="flex items-center gap-1 truncate text-xs font-bold text-ink-soft"
                >
                  {player.isHost && (
                    <CrownIcon width="1em" height="1em" className="shrink-0 text-ink" />
                  )}
                  <span className="truncate">{subline}</span>
                </span>
              )}
            </span>
            <StatusBadge status={status} />
            {variant === 'column' && (
              <span className="shrink-0 text-right font-black tabular-nums">
                {player.score}
                <span className="ml-0.5 text-xs font-bold text-ink-soft">pts</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
