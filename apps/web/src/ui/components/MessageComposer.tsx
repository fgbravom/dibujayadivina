import { useId, useRef, useState, type FormEvent } from 'react';
import { MESSAGE_MAX_LENGTH } from '@dya/shared';
import { COMPOSER_TEXT, prepareMessage } from '../lib/composer';
import type { ComposerMode } from '../types';
import { SendIcon } from './icons';

type MessageComposerProps = {
  mode: ComposerMode;
  onSend: (text: string) => void;
  /** Sin conexión: el campo se bloquea hasta reconectar. */
  disabled?: boolean;
  /** Teclado del teléfono abierto: ya no hace falta dejar sitio para la barra de inicio de iOS. */
  keyboardOpen?: boolean;
  className?: string;
};

const MODE_STYLES: Record<ComposerMode, string> = {
  guess: 'border-copihue',
  guessed: 'border-pasto bg-pasto-soft',
  chat: 'border-ink',
};

/**
 * El único campo de texto de la partida. Según `mode` cambia lo que significa y su marcador de
 * posición: intento de respuesta, chat de quienes ya adivinaron, o chat normal.
 * Tras enviar conserva el foco para que el teclado del teléfono no se cierre.
 */
export function MessageComposer({
  mode,
  onSend,
  disabled = false,
  keyboardOpen = false,
  className = '',
}: MessageComposerProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const text = COMPOSER_TEXT[mode];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = prepareMessage(value, MESSAGE_MAX_LENGTH);
    if (message === null || disabled) return;
    onSend(message);
    setValue('');
    inputRef.current?.focus();
  };

  const remaining = MESSAGE_MAX_LENGTH - value.length;

  return (
    <form
      onSubmit={submit}
      data-testid="composer"
      data-mode={mode}
      className={`flex shrink-0 items-center gap-2 border-t-2 border-ink px-3 pt-2 ${keyboardOpen ? 'pb-2' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'} ${className}`}
    >
      <label htmlFor={inputId} className="sr-only">
        {text.label}
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={disabled ? 'Reconectando…' : text.placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize={mode === 'chat' ? 'sentences' : 'off'}
          spellCheck={mode === 'chat'}
          enterKeyHint="send"
          className={`h-11 w-full rounded-xl border-2 bg-card px-3 pr-12 text-base disabled:bg-paper-deep ${MODE_STYLES[mode]}`}
        />
        {remaining <= 20 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-extrabold tabular-nums text-ink-soft"
          >
            {remaining}
          </span>
        )}
      </div>
      <button
        type="submit"
        aria-label="Enviar mensaje"
        disabled={disabled || value.trim() === ''}
        // Evita que tocar el botón le quite el foco al campo y cierre el teclado.
        onMouseDown={(e) => e.preventDefault()}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-copihue text-white shadow-pop-sm hover:bg-copihue-dark disabled:border-ink-soft disabled:bg-paper-deep disabled:text-ink-soft disabled:shadow-none"
      >
        <SendIcon />
      </button>
    </form>
  );
}
