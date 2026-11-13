// Avisos que flotan sobre cualquier pantalla: sesión abierta en otra pestaña, volviendo a la sala
// y errores de la sala durante la partida.

import type { ErrorCode } from '@dya/shared';
import { useEffect } from 'react';
import { ErrorNotice } from '../ui/components/ErrorNotice';
import { Button } from '../ui/components/Button';
import { Logo } from '../ui/components/Logo';

/** Errores que no vale la pena mostrar en plena partida: carreras normales (acción tardía) del juego. */
const QUIET_IN_GAME: readonly ErrorCode[] = ['wrong_phase', 'not_drawer', 'not_host'];
const TOAST_MS = 5000;

export function TakenOverNotice({ onResume }: { onResume: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="taken-over-title"
      data-testid="taken-over"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border-2 border-ink bg-card p-5 text-center shadow-pop">
        <h2 id="taken-over-title" className="text-xl font-black">
          Abriste el juego en otra pestaña
        </h2>
        <p className="font-bold text-ink-soft">
          Solo se puede jugar desde una pestaña a la vez. Si quieres seguir acá, retoma la partida.
        </p>
        <Button variant="primary" size="lg" onClick={onResume} data-testid="resume-here">
          Retomar aquí
        </Button>
      </div>
    </div>
  );
}

export function ResumingScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <div
      data-testid="resuming"
      className="flex min-h-(--app-h) flex-col items-center justify-center gap-5 p-6"
    >
      <Logo />
      <p role="status" className="text-lg font-extrabold">
        Volviendo a tu sala…
      </p>
      <Button variant="ghost" onClick={onCancel}>
        Ir al inicio
      </Button>
    </div>
  );
}

/**
 * Error de la sala sobre la partida (no hay un lugar fijo para él en esa pantalla). Se cierra solo.
 * Los errores sin importancia en plena partida no se muestran.
 */
export function GameToast({
  error,
  onDismiss,
}: {
  error: ErrorCode | null;
  onDismiss: () => void;
}) {
  const visible = error !== null && !QUIET_IN_GAME.includes(error);
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(id);
  }, [visible, error, onDismiss]);
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md">
        <ErrorNotice error={error} onDismiss={onDismiss} />
      </div>
    </div>
  );
}
