import { useLayoutEffect, useRef, useState } from 'react';
import { avatarClass } from '../lib/avatar';
import type { FeedItem, SystemTone } from '../types';
import { ArrowDownIcon, CheckIcon } from './icons';

type MessageFeedProps = {
  items: readonly FeedItem[];
  className?: string;
};

/** Distancia (px) al fondo bajo la cual se considera que la persona sigue "al final". */
const STICK_THRESHOLD_PX = 48;

const SYSTEM_TONES: Record<SystemTone, string> = {
  info: 'bg-paper-deep text-ink',
  join: 'bg-mar-soft text-ink',
  leave: 'bg-paper-deep text-ink',
  guessed: 'bg-pasto-soft text-ink',
  close: 'bg-sol-soft text-ink',
};

function SystemNotice({ item }: { item: Extract<FeedItem, { kind: 'system' }> }) {
  return (
    <li className="flex justify-center">
      <span
        data-tone={item.tone}
        className={`inline-flex items-center gap-1.5 rounded-full border-2 border-ink/30 px-3 py-0.5 text-sm font-bold ${SYSTEM_TONES[item.tone]}`}
      >
        {item.tone === 'guessed' && <CheckIcon className="text-pasto" width="1em" height="1em" />}
        {item.text}
      </span>
    </li>
  );
}

function Message({ item }: { item: Extract<FeedItem, { kind: 'message' }> }) {
  const guessedChannel = item.channel === 'guessed';
  return (
    <li
      data-channel={item.channel}
      className={`rounded-xl px-2.5 py-1.5 text-[0.95rem] ${
        guessedChannel ? 'border-2 border-pasto bg-pasto-soft' : item.isSelf ? 'bg-mar-soft' : ''
      }`}
    >
      {guessedChannel && (
        <span className="mb-0.5 flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-pasto">
          <CheckIcon width="0.9em" height="0.9em" />
          Solo adivinadores
        </span>
      )}
      <span className="flex items-baseline gap-1.5">
        <span
          aria-hidden="true"
          className={`mt-1 inline-block size-2.5 shrink-0 self-start rounded-full border border-ink ${avatarClass(item.playerId)}`}
        />
        <span className="min-w-0 break-words">
          <span className="font-extrabold">{item.isSelf ? 'Tú' : item.name}</span>
          <span className="sr-only">: </span>
          <span aria-hidden="true">: </span>
          {item.text}
        </span>
      </span>
    </li>
  );
}

/**
 * Lista unificada de intentos, chat y avisos. Se desplaza sola al último mensaje, salvo que la
 * persona haya subido a leer: entonces aparece un botón para volver al final.
 */
export function MessageFeed({ items, className = '' }: MessageFeedProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    stickRef.current = near;
    setAtBottom(near);
  };

  const jumpToEnd = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    setAtBottom(true);
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        role="log"
        aria-label="Mensajes"
        aria-live="polite"
        tabIndex={0}
        data-testid="message-feed"
        className="absolute inset-0 overflow-y-auto overscroll-contain px-2 py-2"
      >
        <ul className="flex flex-col gap-1.5">
          {items.length === 0 && (
            <li className="px-2 py-4 text-center text-sm font-bold text-ink-soft">
              Aquí aparecerán los mensajes.
            </li>
          )}
          {items.map((item) =>
            item.kind === 'system' ? (
              <SystemNotice key={item.id} item={item} />
            ) : (
              <Message key={item.id} item={item} />
            ),
          )}
        </ul>
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={jumpToEnd}
          className="absolute bottom-2 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border-2 border-ink bg-sol px-3 text-sm font-extrabold shadow-pop-sm"
        >
          <ArrowDownIcon width="1em" height="1em" />
          Ir al final
        </button>
      )}
    </div>
  );
}
