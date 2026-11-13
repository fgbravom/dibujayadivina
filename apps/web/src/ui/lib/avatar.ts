// Color e inicial de avatar, estables para un mismo jugador.

/** Clases literales (Tailwind necesita verlas completas en el código fuente). */
export const AVATAR_CLASSES = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
  'bg-avatar-7',
  'bg-avatar-8',
] as const;

export function avatarIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % AVATAR_CLASSES.length;
}

export function avatarClass(seed: string): string {
  return AVATAR_CLASSES[avatarIndex(seed)] ?? AVATAR_CLASSES[0];
}

/** Primer carácter visible del apodo, en mayúscula. */
export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase('es') : '?';
}
