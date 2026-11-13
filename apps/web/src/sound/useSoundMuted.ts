import { useSyncExternalStore } from 'react';
import { muteStore } from './mute';

/** `[silenciado, alternar]`: la preferencia de sonido de este navegador, reactiva. */
export function useSoundMuted(): readonly [boolean, () => void] {
  const muted = useSyncExternalStore(muteStore.subscribe, muteStore.isMuted, () => false);
  return [muted, () => muteStore.setMuted(!muteStore.isMuted())];
}
