import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@dya/shared';

type DyaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Status = 'connecting' | 'connected' | 'disconnected';

const STATUS_LABEL: Record<Status, string> = {
  connecting: 'Conectando…',
  connected: 'Conectado al servidor',
  disconnected: 'Sin conexión con el servidor',
};

const STATUS_COLOR: Record<Status, string> = {
  connecting: 'bg-amber-400',
  connected: 'bg-emerald-500',
  disconnected: 'bg-red-500',
};

export function App() {
  const [status, setStatus] = useState<Status>('connecting');

  useEffect(() => {
    const socket: DyaSocket = io();
    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('disconnected'));
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-3xl font-bold">Dibuja y Adivina</h1>
      <p
        role="status"
        data-testid="connection-status"
        data-status={status}
        className="flex items-center gap-2 text-sm"
      >
        <span className={`inline-block size-3 rounded-full ${STATUS_COLOR[status]}`} />
        {STATUS_LABEL[status]}
      </p>
    </main>
  );
}
