import { useId, useRef, useState } from 'react';
import { shareLink, type ShareEnv, type ShareOutcome } from '../lib/share';
import { Button } from './Button';
import { ShareIcon } from './icons';

type ShareButtonProps = {
  url: string;
  /** Respaldo inyectable para pruebas; por defecto usa `navigator`. */
  env?: ShareEnv;
};

const FEEDBACK: Record<ShareOutcome, string> = {
  shared: '¡Enlace enviado!',
  copied: '¡Enlace copiado! Pégalo en el chat de tus amigos.',
  cancelled: '',
  failed: 'No pudimos copiarlo solo. Copia el enlace de aquí:',
};

/** Comparte el enlace de la sala: panel nativo si existe (teléfonos) o copia al portapapeles. */
export function ShareButton({ url, env }: ShareButtonProps) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const share = async () => {
    const result = await shareLink(
      { url, title: 'Dibuja y Adivina', text: '¡Ven a dibujar y adivinar conmigo!' },
      env,
    );
    setOutcome(result);
    if (result === 'failed') requestAnimationFrame(() => inputRef.current?.select());
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" size="lg" onClick={share} data-testid="share-button">
        <ShareIcon />
        Compartir enlace
      </Button>
      <p role="status" aria-live="polite" className="text-center text-sm font-bold text-ink-soft">
        {outcome ? FEEDBACK[outcome] : ''}
      </p>
      {outcome === 'failed' && (
        <>
          <label htmlFor={inputId} className="sr-only">
            Enlace de la sala
          </label>
          <input
            ref={inputRef}
            id={inputId}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full rounded-xl border-2 border-ink bg-card px-3 text-base"
          />
        </>
      )}
    </div>
  );
}
