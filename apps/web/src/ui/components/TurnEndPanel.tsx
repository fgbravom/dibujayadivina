import type { Player, TurnEnd } from '@dya/shared';
import { buildGainRows, turnEndReasonText } from '../lib/turnEnd';
import { Avatar } from './Avatar';
import { WordDisplay } from './WordDisplay';

type TurnEndPanelProps = {
  turnEnd: TurnEnd;
  players: readonly Player[];
  drawerId: string | null;
  /** Segundos para el siguiente turno; `null` si no hay reloj. */
  secondsToNext: number | null;
};

/** Fase TURN_END, sobre el lienzo: la palabra revelada y los puntos ganados en el turno. */
export function TurnEndPanel({ turnEnd, players, drawerId, secondsToNext }: TurnEndPanelProps) {
  const rows = buildGainRows(players, turnEnd, drawerId);
  const scored = rows.filter((r) => r.gain > 0);
  const noPoints = rows.filter((r) => r.gain === 0);
  return (
    <div
      data-testid="turn-end"
      className="flex h-full flex-col items-center gap-2 overflow-y-auto p-3 text-center"
    >
      <div className="my-auto flex w-full flex-col items-center gap-2">
        <p className="text-sm font-extrabold text-ink-soft">La palabra era</p>
        <WordDisplay word={turnEnd.word} className="text-2xl sm:text-3xl" />
        <p className="text-sm font-bold">{turnEndReasonText(turnEnd.reason)}</p>

        {scored.length > 0 && (
          <ul
            aria-label="Puntos de este turno"
            className="grid w-full max-w-md grid-cols-2 gap-1.5 text-left"
          >
            {scored.map((row) => (
              <li
                key={row.playerId}
                className="flex min-h-8 items-center gap-1.5 rounded-lg border-2 border-ink bg-card px-1.5 py-0.5"
              >
                <Avatar id={row.playerId} name={row.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
                  {row.name}
                  {row.isDrawer && <span className="sr-only"> (dibujó)</span>}
                </span>
                <span className="shrink-0 rounded-md bg-pasto px-1.5 text-sm font-black tabular-nums text-white">
                  +{row.gain}
                </span>
              </li>
            ))}
          </ul>
        )}
        {noPoints.length > 0 && scored.length > 0 && (
          <p className="w-full max-w-md truncate text-xs font-bold text-ink-soft">
            Sin puntos: {noPoints.map((r) => r.name).join(', ')}
          </p>
        )}
        {scored.length === 0 && (
          <p className="text-sm font-bold text-ink-soft">Nadie sumó puntos esta vez.</p>
        )}

        {secondsToNext !== null && (
          <p className="text-sm font-extrabold">Sigue el siguiente turno en {secondsToNext} s</p>
        )}
      </div>
    </div>
  );
}
