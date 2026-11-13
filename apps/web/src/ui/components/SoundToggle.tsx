import { useSoundMuted } from '../../sound';
import { SpeakerIcon, SpeakerOffIcon } from './icons';

/**
 * Botón de silenciar: solo ícono, 44 px de objetivo táctil. La etiqueta es fija y el estado va en
 * `aria-pressed` (pulsado = sonido silenciado). La preferencia se guarda en este navegador.
 */
export function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, toggle] = useSoundMuted();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Silenciar sonido"
      aria-pressed={muted}
      className={`inline-flex size-11 shrink-0 select-none items-center justify-center rounded-xl border-2 border-ink ${
        muted ? 'bg-paper-deep text-ink-soft' : 'bg-card text-ink'
      } ${className}`}
    >
      {muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
    </button>
  );
}
