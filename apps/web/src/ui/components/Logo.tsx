import { PencilIcon } from './icons';

/** Nombre provisional del juego: "Dibuja y Adivina". */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 text-center ${className}`}>
      <span
        aria-hidden="true"
        className="inline-flex size-14 -rotate-6 items-center justify-center rounded-2xl border-2 border-ink bg-sol shadow-pop"
      >
        <PencilIcon width="1.8rem" height="1.8rem" />
      </span>
      <h1 className="text-4xl font-black leading-none tracking-tight sm:text-5xl">
        Dibuja <span className="text-copihue">y</span> Adivina
      </h1>
      <p className="text-base font-bold text-ink-soft">Dibuja, adivina y ríete con tus amigos</p>
    </div>
  );
}
