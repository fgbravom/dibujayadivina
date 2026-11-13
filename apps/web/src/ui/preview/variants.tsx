// Cada variante de la vista previa es un componente con su propio estado local simulado,
// para poder probar a mano los campos, los ajustes y el chat sin servidor.

import { useCallback, useState, type ReactNode } from 'react';
import {
  MESSAGE_MAX_LENGTH,
  normalizeGuess,
  type ErrorCode,
  type GameSettings,
  type Phase,
  type RoomState,
} from '@dya/shared';
import { getComposerMode } from '../lib/composer';
import { guessedFeedItem, messageToFeedItem } from '../lib/feed';
import { GameEndScreen } from '../screens/GameEndScreen';
import { GameScreen } from '../screens/GameScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import type { FeedItem } from '../types';
import {
  SECRET_WORD,
  makeFeed,
  makeGameRoom,
  makeLobbyRoom,
  makeRanking,
  type GameVariant,
} from './fixtures';

export type PreviewVariant = {
  id: string;
  label: string;
  render: (log: (event: string) => void) => ReactNode;
};

function PlaceholderCanvas() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 bg-white text-ink-soft">
      <svg viewBox="0 0 160 120" className="h-1/2 max-h-40" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="156"
          height="116"
          fill="none"
          stroke="#c9c2b0"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
        <circle cx="128" cy="26" r="12" fill="#ffc83d" />
        <path
          d="M30 90V58l30-22 30 22v32z"
          fill="#fde1e6"
          stroke="#1d2b4a"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M52 90V72h16v18" fill="none" stroke="#1d2b4a" strokeWidth="3" />
      </svg>
      <p className="text-sm font-bold">Aquí va el lienzo</p>
    </div>
  );
}

function PlaceholderToolbar() {
  const colors = [
    '#000',
    '#fff',
    '#7f7f7f',
    '#e63946',
    '#f77f00',
    '#fcbf49',
    '#2a9d8f',
    '#1d3557',
    '#457b9d',
    '#7b2cbf',
    '#f28ab2',
    '#8b5a2b',
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-ink-soft bg-card p-1.5">
      {colors.map((c) => (
        <span
          key={c}
          className="size-7 rounded-full border-2 border-ink"
          style={{ background: c }}
        />
      ))}
      <span className="px-2 text-xs font-bold text-ink-soft">Aquí va la barra de herramientas</span>
    </div>
  );
}

/** Mensajes simulados: un intento correcto se convierte en aviso, nunca en texto. */
function useSimulatedFeed(initial: () => FeedItem[], room: RoomState, log: (e: string) => void) {
  const [feed, setFeed] = useState<FeedItem[]>(initial);
  const send = useCallback(
    (text: string) => {
      const mode = getComposerMode({
        phase: room.phase,
        isDrawer: room.selfId === room.drawerId,
        hasGuessed: room.players.find((p) => p.id === room.selfId)?.guessed ?? false,
      });
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const self = room.players.find((p) => p.id === room.selfId);
      log(`message:send (${mode}) "${text.slice(0, MESSAGE_MAX_LENGTH)}"`);
      if (mode === 'guess' && normalizeGuess(text) === normalizeGuess(SECRET_WORD)) {
        setFeed((f) => [...f, guessedFeedItem(self?.name ?? '', true, id)]);
        return;
      }
      setFeed((f) => [
        ...f,
        messageToFeedItem(
          { playerId: room.selfId, text, channel: mode === 'guessed' ? 'guessed' : 'all' },
          room.players,
          room.selfId,
          id,
        ),
      ]);
    },
    [room, log],
  );
  return { feed, send };
}

function HomeVariant({
  log,
  error,
  inviteCode,
}: {
  log: (e: string) => void;
  error?: ErrorCode;
  inviteCode?: string;
}) {
  const [currentError, setError] = useState<ErrorCode | null>(error ?? null);
  return (
    <HomeScreen
      initialName=""
      inviteCode={inviteCode ?? null}
      error={currentError}
      onDismissError={() => setError(null)}
      connected
      onlineCount={12}
      onCreateRoom={(name) => log(`room:create name="${name}"`)}
      onJoinRoom={(code, name) => log(`room:join code=${code} name="${name}"`)}
    />
  );
}

function LobbyVariant({
  log,
  asGuest,
  crowd,
  solo,
  connected = true,
}: {
  log: (e: string) => void;
  asGuest?: boolean;
  crowd?: boolean;
  solo?: boolean;
  connected?: boolean;
}) {
  const [now] = useState(() => Date.now());
  const [settings, setSettings] = useState<GameSettings>({ rounds: 3, drawSeconds: 80 });
  const [error, setError] = useState<ErrorCode | null>(null);
  const room = { ...makeLobbyRoom(now, { selfId: asGuest ? 'p2' : 'p1', crowd, solo }), settings };
  const { feed, send } = useSimulatedFeed(
    () => makeFeed(room.players, room.selfId, 'lobby'),
    room,
    log,
  );
  return (
    <LobbyScreen
      room={room}
      feed={feed}
      connected={connected}
      error={error}
      onDismissError={() => setError(null)}
      onChangeSettings={(s) => {
        log(`room:settings rounds=${s.rounds} drawSeconds=${s.drawSeconds}`);
        setSettings(s);
      }}
      onStart={() => {
        log('game:start');
        setError('not_enough_players');
      }}
      onSendMessage={send}
      onLeave={() => log('leave')}
    />
  );
}

function GameVariantView({
  log,
  phase,
  view,
  crowd,
  secondsLeft,
  connected = true,
}: {
  log: (e: string) => void;
  phase: Extract<Phase, 'CHOOSING' | 'DRAWING' | 'TURN_END'>;
  view: GameVariant;
  crowd?: boolean;
  secondsLeft?: number;
  connected?: boolean;
}) {
  const [now] = useState(() => Date.now());
  const room = makeGameRoom(now, phase, { view, crowd, secondsLeft });
  const { feed, send } = useSimulatedFeed(
    () => makeFeed(room.players, room.selfId, view === 'guessed' ? 'guessed' : 'drawing'),
    room,
    log,
  );
  return (
    <GameScreen
      room={room}
      feed={feed}
      connected={connected}
      serverOffsetMs={0}
      canvasSlot={<PlaceholderCanvas />}
      toolbarSlot={<PlaceholderToolbar />}
      onChooseWord={(i) => log(`word:choose index=${i}`)}
      onSendMessage={send}
      onLeave={() => log('leave')}
    />
  );
}

function EndVariant({
  log,
  asGuest,
  tie,
  crowd,
}: {
  log: (e: string) => void;
  asGuest?: boolean;
  tie?: boolean;
  crowd?: boolean;
}) {
  return (
    <GameEndScreen
      ranking={makeRanking({ tie, crowd })}
      selfId={asGuest ? 'p3' : 'p1'}
      hostId="p1"
      connected
      onPlayAgain={() => log('play again')}
      onLeave={() => log('leave')}
    />
  );
}

export const VARIANTS: PreviewVariant[] = [
  { id: 'home', label: 'Inicio', render: (log) => <HomeVariant log={log} /> },
  {
    id: 'home-error',
    label: 'Inicio con error',
    render: (log) => <HomeVariant log={log} error="room_not_found" />,
  },
  {
    id: 'home-invite',
    label: 'Inicio por enlace',
    render: (log) => <HomeVariant log={log} inviteCode="KQXM" />,
  },
  {
    id: 'lobby-host',
    label: 'Sala de espera: anfitrión',
    render: (log) => <LobbyVariant log={log} />,
  },
  {
    id: 'lobby-guest',
    label: 'Sala de espera: invitado',
    render: (log) => <LobbyVariant log={log} asGuest />,
  },
  {
    id: 'lobby-solo',
    label: 'Sala de espera: 1 jugador',
    render: (log) => <LobbyVariant log={log} solo />,
  },
  {
    id: 'lobby-crowd',
    label: 'Sala de espera: 12 jugadores',
    render: (log) => <LobbyVariant log={log} crowd />,
  },
  {
    id: 'choosing-drawer',
    label: 'Eligiendo: dibujante',
    render: (log) => <GameVariantView log={log} phase="CHOOSING" view="drawer" />,
  },
  {
    id: 'choosing-guesser',
    label: 'Eligiendo: adivinador',
    render: (log) => <GameVariantView log={log} phase="CHOOSING" view="guesser" />,
  },
  {
    id: 'drawing-drawer',
    label: 'Dibujando: dibujante',
    render: (log) => <GameVariantView log={log} phase="DRAWING" view="drawer" />,
  },
  {
    id: 'drawing-guesser',
    label: 'Dibujando: adivinador',
    render: (log) => <GameVariantView log={log} phase="DRAWING" view="guesser" />,
  },
  {
    id: 'drawing-guessed',
    label: 'Dibujando: ya adivinó',
    render: (log) => <GameVariantView log={log} phase="DRAWING" view="guessed" />,
  },
  {
    id: 'drawing-urgent',
    label: 'Dibujando: últimos segundos',
    render: (log) => <GameVariantView log={log} phase="DRAWING" view="guesser" secondsLeft={8} />,
  },
  {
    id: 'turn-end',
    label: 'Fin de turno',
    render: (log) => <GameVariantView log={log} phase="TURN_END" view="guessed" />,
  },
  {
    id: 'turn-end-crowd',
    label: 'Fin de turno: 12 jugadores',
    render: (log) => <GameVariantView log={log} phase="TURN_END" view="guessed" crowd />,
  },
  { id: 'game-end', label: 'Fin de partida: anfitrión', render: (log) => <EndVariant log={log} /> },
  {
    id: 'game-end-guest-tie',
    label: 'Fin de partida: invitado con empate',
    render: (log) => <EndVariant log={log} asGuest tie />,
  },
  {
    id: 'game-end-crowd',
    label: 'Fin de partida: 12 jugadores',
    render: (log) => <EndVariant log={log} crowd />,
  },
  {
    id: 'crowd-drawing',
    label: 'Sala con 12 jugadores',
    render: (log) => <GameVariantView log={log} phase="DRAWING" view="guesser" crowd />,
  },
  {
    id: 'disconnected',
    label: 'Desconectado',
    render: (log) => <GameVariantView log={log} phase="DRAWING" view="guesser" connected={false} />,
  },
  {
    id: 'disconnected-lobby',
    label: 'Desconectado (sala de espera)',
    render: (log) => <LobbyVariant log={log} connected={false} />,
  },
];
