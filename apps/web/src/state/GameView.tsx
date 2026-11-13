// Pantalla de partida conectada: monta el lienzo y la barra de herramientas en los huecos de
// `GameScreen` y los une al cliente de sockets.

import { DEFAULT_STROKE_COLOR, DEFAULT_STROKE_SIZE, type RoomState } from '@dya/shared';
import { useCallback, useRef, useState } from 'react';
import {
  CanvasToolbar,
  DrawingCanvas,
  type DrawingCanvasHandle,
  type DrawingTool,
} from '../canvas';
import { GameScreen, type FeedItem } from '../ui';
import { canvasBridge } from './canvasBridge';
import { actions } from './client';

type GameViewProps = {
  room: RoomState;
  feed: readonly FeedItem[];
  connected: boolean;
  serverOffsetMs: number;
  onLeave: () => void;
};

export function GameView({ room, feed, connected, serverOffsetMs, onLeave }: GameViewProps) {
  const handleRef = useRef<DrawingCanvasHandle | null>(null);
  const [tool, setTool] = useState<DrawingTool>({
    color: DEFAULT_STROKE_COLOR,
    size: DEFAULT_STROKE_SIZE,
    tool: 'brush',
  });

  const setHandle = useCallback((handle: DrawingCanvasHandle | null) => {
    handleRef.current = handle;
    canvasBridge.setHandle(handle);
  }, []);

  const drawing = room.selfId === room.drawerId && room.phase === 'DRAWING';

  const undo = () => {
    handleRef.current?.undo();
    actions.undo();
  };

  const clear = () => {
    const handle = handleRef.current;
    // Nada que borrar: no se pregunta. Si hay algo, se confirma para evitar borrones accidentales.
    if (!handle || handle.getStrokes().length === 0) return;
    if (!window.confirm('¿Borrar todo el dibujo?')) return;
    handle.clear();
    actions.clear();
  };

  return (
    <GameScreen
      room={room}
      feed={feed}
      connected={connected}
      serverOffsetMs={serverOffsetMs}
      canvasSlot={
        <DrawingCanvas
          ref={setHandle}
          mode={drawing ? 'drawer' : 'spectator'}
          tool={tool}
          onStrokeStart={actions.strokeStart}
          onStrokePoints={actions.strokePoints}
          onStrokeEnd={actions.strokeEnd}
        />
      }
      toolbarSlot={
        <CanvasToolbar
          tool={tool}
          onToolChange={setTool}
          onUndo={undo}
          onClear={clear}
          disabled={!connected}
        />
      }
      onChooseWord={actions.chooseWord}
      onSendMessage={actions.sendMessage}
      onLeave={onLeave}
    />
  );
}
