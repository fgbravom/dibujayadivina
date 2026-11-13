// Efectos de sonido sintetizados con Web Audio. Sin archivos de audio ni dependencias.

export { installAudioUnlock, observeSounds, playSound } from './engine';
export type { SoundObserver, SoundOutcome } from './engine';
export { EFFECTS, SOUND_IDS, type SoundId } from './effects';
export { muteStore } from './mute';
export { nextTick, soundForEvent, type TickState } from './triggers';
export { useSoundMuted } from './useSoundMuted';
