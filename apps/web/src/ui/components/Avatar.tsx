import { avatarClass, avatarInitial } from '../lib/avatar';

type AvatarProps = {
  /** Semilla estable del color: el id del jugador. */
  id: string;
  name: string;
  size?: 'sm' | 'md';
  className?: string;
};

/** Círculo con la inicial del apodo. Decorativo: el nombre siempre se escribe al lado. */
export function Avatar({ id, name, size = 'md', className = '' }: AvatarProps) {
  const dims = size === 'sm' ? 'size-7 text-sm' : 'size-9 text-base';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-black text-ink ${dims} ${avatarClass(id)} ${className}`}
    >
      {avatarInitial(name)}
    </span>
  );
}
