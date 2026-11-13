import type { RankingEntry } from '@dya/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { LogoutIcon, StarIcon } from '../components/icons';
import { ReconnectBanner } from '../components/ReconnectBanner';
import { buildPodium, type PodiumPlace } from '../lib/ranking';

export type GameEndScreenProps = {
  /** `GameEndPayload.ranking` / `RoomState.ranking`: con posiciones compartidas en los empates. */
  ranking: readonly RankingEntry[];
  selfId: string;
  hostId: string;
  connected: boolean;
  /** Solo el anfitrión: vuelve la sala a LOBBY. */
  onPlayAgain: () => void;
  onLeave: () => void;
};

const PLACE_STYLES: Record<1 | 2 | 3, { bar: string; height: string; label: string }> = {
  1: { bar: 'bg-sol', height: 'h-32 sm:h-40', label: '1º' },
  2: { bar: 'bg-plata', height: 'h-24 sm:h-28', label: '2º' },
  3: { bar: 'bg-bronce', height: 'h-16 sm:h-20', label: '3º' },
};

function PodiumColumn({ place, selfId }: { place: PodiumPlace; selfId: string }) {
  const style = PLACE_STYLES[place.place];
  const score = place.entries[0]?.score ?? 0;
  return (
    <li
      data-testid={`podium-${place.place}`}
      className="flex min-w-0 flex-1 animate-rise flex-col items-center justify-end gap-1.5"
      style={{ animationDelay: `${(3 - place.place) * 120}ms` }}
    >
      {place.place === 1 && (
        <StarIcon className="size-8 text-sol" fill="currentColor" stroke="var(--color-ink)" />
      )}
      <ul className="flex w-full flex-wrap items-end justify-center gap-x-2 gap-y-1">
        {place.entries.map((entry) => (
          <li
            key={entry.playerId}
            className="flex min-w-0 max-w-full flex-1 basis-16 flex-col items-center"
          >
            <Avatar id={entry.playerId} name={entry.name} />
            <span className="w-full truncate text-center text-sm font-extrabold sm:text-base">
              {entry.name}
              {entry.playerId === selfId && <span className="font-bold text-ink-soft"> (tú)</span>}
            </span>
          </li>
        ))}
      </ul>
      <div
        className={`flex w-full flex-col items-center justify-start gap-0.5 rounded-t-xl border-2 border-b-0 border-ink pt-2 ${style.bar} ${style.height}`}
      >
        <span className="text-2xl font-black">{style.label}</span>
        <span className="text-sm font-extrabold tabular-nums">{score} pts</span>
      </div>
    </li>
  );
}

export function GameEndScreen({
  ranking,
  selfId,
  hostId,
  connected,
  onPlayAgain,
  onLeave,
}: GameEndScreenProps) {
  const { places, rest } = buildPodium(ranking);
  const isHost = selfId === hostId;
  const hostName = ranking.find((r) => r.playerId === hostId)?.name;
  const me = ranking.find((r) => r.playerId === selfId);
  const winners = ranking.filter((r) => r.rank === 1);

  return (
    <div className="safe-pad flex min-h-(--app-h) flex-col">
      <ReconnectBanner connected={connected} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-4 py-6">
        <header className="text-center">
          <h1 className="text-4xl font-black leading-none">¡Terminó la partida!</h1>
          <p data-testid="winner-line" className="mt-2 text-lg font-extrabold text-ink-soft">
            {winners.length === 0
              ? 'Nadie jugó esta vez.'
              : winners.length === 1
                ? `¡Ganó ${winners[0]?.name}!`
                : `Empate en el primer lugar: ${winners.map((w) => w.name).join(' y ')}`}
          </p>
          {me && (
            <p className="text-sm font-bold text-ink-soft">
              Quedaste en el lugar {me.rank} con {me.score} puntos.
            </p>
          )}
        </header>

        <section
          aria-label="Podio"
          className="rounded-2xl border-2 border-ink bg-card px-3 pt-5 shadow-pop"
        >
          <ol className="flex items-end gap-2">
            {places.map((place) => (
              <PodiumColumn key={place.place} place={place} selfId={selfId} />
            ))}
          </ol>
        </section>

        {rest.length > 0 && (
          <section
            aria-labelledby="rest-title"
            className="rounded-2xl border-2 border-ink bg-card p-3 shadow-pop"
          >
            <h2 id="rest-title" className="sr-only">
              Resto de la tabla
            </h2>
            <ol className="flex flex-col gap-1.5" data-testid="ranking-rest">
              {rest.map((entry) => (
                <li
                  key={entry.playerId}
                  className={`flex min-h-11 items-center gap-2.5 rounded-xl px-2 ${entry.playerId === selfId ? 'bg-mar-soft' : ''}`}
                >
                  <span className="w-6 text-center font-black tabular-nums text-ink-soft">
                    {entry.rank}º
                  </span>
                  <Avatar id={entry.playerId} name={entry.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-extrabold">
                    {entry.name}
                    {entry.playerId === selfId && (
                      <span className="font-bold text-ink-soft"> (tú)</span>
                    )}
                  </span>
                  <span className="font-black tabular-nums">{entry.score} pts</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="flex flex-col gap-3">
          {isHost ? (
            <Button
              variant="primary"
              size="lg"
              onClick={onPlayAgain}
              disabled={!connected}
              data-testid="play-again"
            >
              Jugar de nuevo
            </Button>
          ) : (
            <p
              data-testid="waiting-for-host"
              className="rounded-xl border-2 border-ink bg-sol-soft p-3 text-center font-extrabold"
            >
              Esperando a que {hostName ?? 'el anfitrión'} arme otra partida…
            </p>
          )}
          <Button variant="secondary" onClick={onLeave}>
            <LogoutIcon />
            Salir de la sala
          </Button>
        </div>
      </main>
    </div>
  );
}
