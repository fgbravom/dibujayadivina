// Motor de sonido: interpreta los efectos de `effects.ts` con Web Audio. Un único `AudioContext`,
// creado con el primer gesto de la persona (los navegadores no dejan sonar antes, y crearlo antes
// solo llena la consola de avisos). Si Web Audio no existe o algo falla, todo queda en silencio
// sin errores: jamás debe romper el juego por un sonido.

import { EFFECTS, type Effect, type Note, type NoiseBurst, type SoundId } from './effects';
import { muteStore } from './mute';

/** Volumen general: moderado, para que ningún efecto sea estridente. */
const MASTER_VOLUME = 0.6;
/** Silencio práctico para las rampas exponenciales (no admiten 0). */
const FLOOR = 0.0001;
const DEFAULT_ATTACK = 0.006;
/** Margen para que `stop()` no corte la cola del sonido. */
const STOP_MARGIN = 0.03;

/** Qué pasó con un disparo: útil para depurar y para comprobar el comportamiento sin oír. */
export type SoundOutcome = 'played' | 'muted' | 'locked' | 'throttled' | 'failed';
export type SoundObserver = (id: SoundId, outcome: SoundOutcome) => void;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
/** Sin Web Audio (o falló al crearlo): no se vuelve a intentar. */
let unavailable = false;
let installed = false;
const active = new Set<AudioScheduledSourceNode>();
const lastPlayedAt = new Map<SoundId, number>();
const observers = new Set<SoundObserver>();

function notify(id: SoundId, outcome: SoundOutcome): void {
  for (const observer of observers) {
    try {
      observer(id, outcome);
    } catch {
      // Un observador defectuoso no debe afectar al sonido.
    }
  }
}

/** Avisa de cada disparo y su resultado. Devuelve la función para dejar de observar. */
export function observeSounds(observer: SoundObserver): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}

function createContext(): AudioContext | null {
  if (ctx) return ctx;
  if (unavailable) return null;
  try {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    const created = new Ctor();
    // Un compresor suave evita que los acordes sumen de más.
    const compressor = created.createDynamicsCompressor();
    const gain = created.createGain();
    gain.gain.value = MASTER_VOLUME;
    gain.connect(compressor);
    compressor.connect(created.destination);
    ctx = created;
    master = gain;
    return created;
  } catch {
    unavailable = true;
    ctx = null;
    master = null;
    return null;
  }
}

/** Primer gesto (o cualquiera posterior si el navegador volvió a suspender el contexto). */
function wake(): void {
  const audio = createContext();
  if (!audio || audio.state === 'running') return;
  try {
    audio.resume().then(
      () => primeIos(audio),
      () => {},
    );
  } catch {
    // Sin permiso todavía: se reintenta en el próximo gesto.
  }
}

/** Safari de iOS solo se desbloquea del todo tras reproducir algo dentro del gesto: un búfer vacío basta. */
function primeIos(audio: AudioContext): void {
  try {
    const source = audio.createBufferSource();
    source.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    source.connect(audio.destination);
    source.start();
  } catch {
    // Nada que hacer: el sonido solo quedará en silencio.
  }
}

function onVisibility(): void {
  if (document.visibilityState !== 'visible' || !ctx || ctx.state === 'running') return;
  try {
    ctx.resume().catch(() => {});
  } catch {
    // Se reintentará con el próximo gesto.
  }
}

/** Corta de inmediato lo que esté sonando (al silenciar). */
function stopAll(): void {
  if (!ctx || !master) return;
  try {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0, now, 0.01);
    for (const source of active) {
      try {
        source.stop(now + 0.06);
      } catch {
        // Ya había terminado.
      }
    }
  } catch {
    // Contexto en mal estado: nada más que cortar.
  }
}

/**
 * Instala los oyentes que desbloquean el audio con el primer gesto (toque, clic o tecla) y lo
 * reanudan al volver a la pestaña. Se llama una sola vez al arrancar; no crea el contexto aún.
 */
export function installAudioUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const options = { capture: true, passive: true } as const;
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
    window.addEventListener(type, wake, options);
  }
  document.addEventListener('visibilitychange', onVisibility);
  muteStore.subscribe(() => {
    if (muteStore.isMuted()) stopAll();
  });
}

// --- Síntesis ---------------------------------------------------------------

function track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  active.add(source);
  source.addEventListener('ended', () => {
    active.delete(source);
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // Ya desconectado.
      }
    }
  });
}

/** Una voz: oscilador con su envolvente (ataque, sostén opcional y caída exponencial). */
function voice(
  audio: AudioContext,
  out: AudioNode,
  t0: number,
  note: Note,
  freq: number,
  to: number | undefined,
  vol: number,
  dur: number,
): void {
  const start = t0 + note.at;
  const attack = Math.min(note.attack ?? DEFAULT_ATTACK, dur / 2);
  const hold = Math.min(note.hold ?? 0, Math.max(0, dur - attack));

  const osc = audio.createOscillator();
  osc.type = note.timbre.wave;
  osc.frequency.setValueAtTime(freq, start);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, start + dur);

  const env = audio.createGain();
  env.gain.setValueAtTime(FLOOR, start);
  env.gain.linearRampToValueAtTime(vol, start + attack);
  if (hold > 0) env.gain.setValueAtTime(vol, start + attack + hold);
  env.gain.exponentialRampToValueAtTime(FLOOR, start + dur);

  const nodes: AudioNode[] = [osc, env];
  osc.connect(env);
  if (note.timbre.lowpass) {
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = note.timbre.lowpass;
    env.connect(filter);
    filter.connect(out);
    nodes.push(filter);
  } else {
    env.connect(out);
  }
  osc.start(start);
  osc.stop(start + dur + STOP_MARGIN);
  track(osc, nodes);
}

function scheduleNote(audio: AudioContext, out: AudioNode, t0: number, note: Note): void {
  const limit = audio.sampleRate / 2 - 100;
  voice(audio, out, t0, note, note.freq, note.to, note.vol, note.dur);
  for (const partial of note.timbre.partials ?? []) {
    const freq = note.freq * partial.ratio;
    if (freq >= limit) continue;
    const to = note.to === undefined ? undefined : Math.min(limit, note.to * partial.ratio);
    voice(audio, out, t0, note, freq, to, note.vol * partial.vol, note.dur * (partial.decay ?? 1));
  }
}

function getNoise(audio: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.round(audio.sampleRate * 0.25);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

function scheduleNoise(audio: AudioContext, out: AudioNode, t0: number, burst: NoiseBurst): void {
  const start = t0 + burst.at;
  const source = audio.createBufferSource();
  source.buffer = getNoise(audio);
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = burst.lowpass;
  const env = audio.createGain();
  env.gain.setValueAtTime(FLOOR, start);
  env.gain.linearRampToValueAtTime(burst.vol, start + 0.004);
  env.gain.exponentialRampToValueAtTime(FLOOR, start + burst.dur);
  source.connect(filter);
  filter.connect(env);
  env.connect(out);
  source.start(start);
  source.stop(start + burst.dur + STOP_MARGIN);
  track(source, [source, filter, env]);
}

function schedule(audio: AudioContext, out: AudioNode, effect: Effect): void {
  const t0 = audio.currentTime + 0.01;
  for (const note of effect.notes) scheduleNote(audio, out, t0, note);
  for (const burst of effect.noise ?? []) scheduleNoise(audio, out, t0, burst);
}

/**
 * Suena un efecto. No hace nada (sin error) si está silenciado, si aún no hubo un gesto que
 * desbloquee el audio, si el efecto sonó hace menos de su separación mínima o si Web Audio falla.
 */
export function playSound(id: SoundId): void {
  if (muteStore.isMuted()) return notify(id, 'muted');
  if (!ctx || !master || ctx.state !== 'running') {
    if (ctx && ctx.state !== 'running') onVisibility();
    return notify(id, 'locked');
  }

  const effect = EFFECTS[id];
  const nowMs = performance.now();
  const last = lastPlayedAt.get(id);
  if (effect.minGapMs !== undefined && last !== undefined && nowMs - last < effect.minGapMs) {
    return notify(id, 'throttled');
  }

  try {
    // Tras un silencio la ganancia general quedó en 0: se restituye.
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
    schedule(ctx, master, effect);
    lastPlayedAt.set(id, nowMs);
    notify(id, 'played');
  } catch {
    notify(id, 'failed');
  }
}
