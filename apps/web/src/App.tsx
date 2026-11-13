import type { ReactNode } from 'react';
import { GameEndScreen, HomeScreen, LobbyScreen } from './ui';
import { actions } from './state/client';
import { GameToast, ResumingScreen, TakenOverNotice } from './state/Notices';
import { GameView } from './state/GameView';
import { useGameStore } from './state/store';

function confirmLeave(): void {
  if (window.confirm('¿Quieres salir de la sala?')) actions.leaveRoom();
}

/** Elige la pantalla según el estado de la sala (PLAN.md sección 2: LOBBY → CHOOSING → DRAWING → TURN_END → GAME_END). */
export function App() {
  const status = useGameStore((s) => s.status);
  const takenOver = useGameStore((s) => s.takenOver);
  const resuming = useGameStore((s) => s.resuming);
  const busy = useGameStore((s) => s.busy);
  const nickname = useGameStore((s) => s.nickname);
  const inviteCode = useGameStore((s) => s.inviteCode);
  const homeError = useGameStore((s) => s.homeError);
  const roomError = useGameStore((s) => s.roomError);
  const { room, feed, serverOffsetMs } = useGameStore((s) => s.session);

  // Mientras se abre el primer socket no se asusta con un aviso de conexión.
  const connected = status !== 'disconnected' && !takenOver;

  let screen: ReactNode;
  if (!room) {
    screen = resuming ? (
      <ResumingScreen onCancel={actions.cancelResume} />
    ) : (
      <HomeScreen
        initialName={nickname}
        inviteCode={inviteCode}
        error={homeError}
        onDismissError={actions.dismissHomeError}
        busy={busy}
        connected={connected}
        onCreateRoom={actions.createRoom}
        onJoinRoom={actions.joinRoom}
        onNameChange={actions.setNickname}
      />
    );
  } else if (room.phase === 'LOBBY') {
    screen = (
      <LobbyScreen
        room={room}
        feed={feed}
        connected={connected}
        error={roomError}
        onDismissError={actions.dismissRoomError}
        onChangeSettings={actions.changeSettings}
        onStart={actions.startGame}
        onSendMessage={actions.sendMessage}
        onLeave={confirmLeave}
      />
    );
  } else if (room.phase === 'GAME_END') {
    screen = (
      <GameEndScreen
        ranking={room.ranking ?? []}
        selfId={room.selfId}
        hostId={room.hostId}
        connected={connected}
        // "Jugar de nuevo" es `game:start`: el servidor devuelve la sala a la sala de espera.
        onPlayAgain={actions.startGame}
        onLeave={confirmLeave}
      />
    );
  } else {
    screen = (
      <>
        <GameView
          room={room}
          feed={feed}
          connected={connected}
          serverOffsetMs={serverOffsetMs}
          onLeave={confirmLeave}
        />
        <GameToast error={roomError} onDismiss={actions.dismissRoomError} />
      </>
    );
  }

  return (
    <>
      {screen}
      {takenOver && <TakenOverNotice onResume={actions.resumeHere} />}
    </>
  );
}
