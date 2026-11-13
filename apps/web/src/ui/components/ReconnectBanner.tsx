import { WifiOffIcon } from './icons';

/**
 * Aviso de reconexión. El contenedor con `role="status"` está siempre en el DOM para que los
 * lectores de pantalla anuncien el cambio cuando aparece el texto.
 */
export function ReconnectBanner({ connected }: { connected: boolean }) {
  return (
    <div role="status" aria-live="polite" className="shrink-0">
      {!connected && (
        <div
          data-testid="reconnect-banner"
          className="flex items-center justify-center gap-2 border-b-2 border-ink bg-sol px-4 py-2 text-center text-sm font-extrabold text-ink"
        >
          <WifiOffIcon />
          <span>Se cortó la conexión. Intentando reconectar…</span>
        </div>
      )}
    </div>
  );
}
