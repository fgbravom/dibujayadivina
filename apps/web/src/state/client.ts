// Cliente de sockets tipado con el contrato. Convierte los eventos del servidor en cambios del
// store (vía el reductor puro de `session.ts`) y en comandos para el lienzo (`canvasBridge`), y
// expone las acciones que la interfaz puede pedir. Aquí viven la reconexión, la identidad y la URL.

import {
  SERVER_EVENTS,
  type ClientToServerEvents,
  type ErrorCode,
  type GameSettings,
  type ServerToClientEvents,
  type StrokeEndPayload,
  type StrokePointsPayload,
  type StrokeStartPayload,
} from '@dya/shared';
import { io, type Socket } from 'socket.io-client';
import { playSound, soundForEvent } from '../sound';
import { roomSharePath } from '../ui/lib/share';
import { canvasBridge, canvasCommandFor } from './canvasBridge';
import {
  browserStorage,
  clearSavedRoom,
  loadNickname,
  loadSavedRoom,
  loadSessionId,
  saveNickname,
  saveRoom,
  type SavedRoom,
} from './identity';
import { parseRoomPath } from './route';
import { initialSession, reduceSession, type ServerEvent } from './session';
import { startSoundDriver } from './soundDriver';
import { useGameStore } from './store';

type DyaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Cuánto se espera el acuse de `room:create` / `room:join` antes de darlo por perdido. */
const ACK_TIMEOUT_MS = 8000;

// El apodo vive en localStorage (lo comparten las pestañas). La sala a la que se pertenece vive en
// sessionStorage: sobrevive a recargar la página, pero una pestaña nueva no se mete sola a la sala.
const local = browserStorage('local');
const tab = browserStorage('session');

const sessionId = loadSessionId(local);

let socket: DyaSocket | null = null;
/** Sala a la que pertenece este navegador; con ella se reenvía `room:join` al reconectar. */
let joined: SavedRoom | null = null;
/** Ya se entró a `joined` en la conexión actual (acuse recibido). */
let ready = false;
/** Hay un `room:join` de reconexión esperando su acuse. */
let rejoining = false;
let started = false;

const set = useGameStore.setState;

// --- URL --------------------------------------------------------------------

/** Al entrar a una sala la URL pasa a `/sala/CODIGO`: se reemplaza si ya era una ruta de sala (enlace), se agrega si venía de `/`. */
function showRoomUrl(code: string): void {
  const target = roomSharePath(code);
  if (window.location.pathname === target) return;
  if (parseRoomPath(window.location.pathname) !== null) {
    window.history.replaceState(null, '', target);
  } else {
    window.history.pushState(null, '', target);
  }
}

// --- Eventos del servidor ---------------------------------------------------

function handleServerEvent(event: ServerEvent): void {
  const command = canvasCommandFor(event);
  if (command) canvasBridge.dispatch(command);

  if (event.type === 'system:error') {
    handleSystemError(event.payload.code);
    return;
  }

  const { session, roomError } = useGameStore.getState();
  // El efecto se decide con la foto previa al evento; `room:state` (entrar o reconectar) no suena.
  const sound = soundForEvent(session.room, event);
  if (sound) playSound(sound);
  const next = reduceSession(session, event, Date.now());
  if (next === session) return;
  const phaseChanged = next.room?.phase !== session.room?.phase;
  set({
    session: next,
    ...(event.type === 'room:state' ? { resuming: false } : {}),
    // Un aviso de la fase anterior ya no aplica.
    ...(phaseChanged && roomError !== null ? { roomError: null } : {}),
  });
}

function handleSystemError(code: ErrorCode): void {
  // Pasa seguido en un juego de trazos rápidos y no interrumpe nada.
  if (code === 'rate_limited') return;
  // El servidor no nos reconoce en la sala (p. ej. se perdió el acuse): se vuelve a entrar.
  if (code === 'not_in_room') {
    rejoin();
    return;
  }
  // El servidor cerró la sala (p. ej. por inactividad): no hay a dónde volver.
  if (code === 'room_not_found') {
    abandonRoom(code);
    return;
  }
  set({ roomError: code });
}

// --- Socket y reconexión ----------------------------------------------------

function connectSocket(): void {
  const s: DyaSocket = io();
  socket = s;

  s.on('connect', () => {
    set({ status: 'connected', takenOver: false });
    if (joined) rejoin();
  });

  s.on('disconnect', (reason) => {
    ready = false;
    rejoining = false;
    set({ status: 'disconnected' });
    // El servidor cierra esta conexión cuando la misma sesión se abre en otra pestaña: no se
    // reconecta sola (se pelearían), la persona decide.
    if (reason === 'io server disconnect') {
      if (joined) set({ takenOver: true });
      else s.connect();
    }
  });

  s.on('connect_error', () => {
    set({ status: 'disconnected' });
  });

  for (const name of Object.values(SERVER_EVENTS)) {
    s.on(name, ((payload: unknown) => {
      handleServerEvent({ type: name, payload } as ServerEvent);
    }) as never);
  }
}

/** Reenvía `room:join` con el mismo `sessionId` para recuperar el puesto. */
function rejoin(): void {
  const target = joined;
  if (!socket || !target || rejoining) return;
  rejoining = true;
  socket
    .timeout(ACK_TIMEOUT_MS)
    .emit('room:join', { code: target.code, name: target.name, sessionId }, (err, res) => {
      rejoining = false;
      if (joined !== target) return;
      if (err) {
        // Sin respuesta: se reintenta cuando el socket vuelva a conectar; si no, queda el aviso de conexión.
        return;
      }
      if (!res.ok) {
        abandonRoom(res.error);
        return;
      }
      ready = true;
    });
}

/** Se pierde la sala (no existe, está llena…): se vuelve al inicio mostrando el error. */
function abandonRoom(error: ErrorCode | null): void {
  joined = null;
  ready = false;
  clearSavedRoom(tab);
  window.history.replaceState(null, '', '/');
  canvasBridge.dispatch({ type: 'clear' });
  set({
    session: initialSession,
    resuming: false,
    busy: false,
    inviteCode: null,
    homeError: error,
    roomError: null,
  });
}

function enterRoom(code: string, name: string): void {
  joined = { code, name };
  ready = true;
  saveRoom(tab, joined);
  showRoomUrl(code);
  set({ busy: false, resuming: false, inviteCode: null, homeError: null });
}

function requestRoom(
  event: 'room:create' | 'room:join',
  payload: { code?: string; name: string },
): void {
  if (!socket) return;
  const { name } = payload;
  set({ busy: true, homeError: null, nickname: name });
  saveNickname(local, name);
  const done = (err: Error | null, res?: { ok: boolean; code?: string; error?: ErrorCode }) => {
    if (err || !res) {
      set({ busy: false, homeError: 'internal' });
    } else if (!res.ok || !res.code) {
      set({ busy: false, homeError: res.error ?? 'internal' });
    } else {
      enterRoom(res.code, name);
    }
  };
  if (event === 'room:create') {
    socket.timeout(ACK_TIMEOUT_MS).emit('room:create', { name, sessionId }, done);
  } else if (payload.code) {
    socket.timeout(ACK_TIMEOUT_MS).emit('room:join', { code: payload.code, name, sessionId }, done);
  }
}

// --- Salir de la sala -------------------------------------------------------

/**
 * Sale de la sala: se cierra el socket y se abre uno nuevo (el contrato no tiene un evento de
 * salida), se olvida la sala guardada y se vuelve a `/` (salvo `keepUrl`, cuando la URL ya la
 * eligió el botón atrás del navegador).
 */
function leaveRoom(options: { keepUrl?: boolean } = {}): void {
  joined = null;
  ready = false;
  rejoining = false;
  clearSavedRoom(tab);
  if (!options.keepUrl) window.history.replaceState(null, '', '/');
  canvasBridge.dispatch({ type: 'clear' });

  const old = socket;
  old?.removeAllListeners();
  old?.disconnect();
  connectSocket();

  set({
    status: 'connecting',
    takenOver: false,
    resuming: false,
    busy: false,
    inviteCode: null,
    homeError: null,
    roomError: null,
    session: initialSession,
  });
}

/** Botón atrás/adelante del navegador. */
function onPopState(): void {
  const code = parseRoomPath(window.location.pathname);
  if (!joined) {
    set({ inviteCode: code });
    return;
  }
  if (code === joined.code) return;
  if (window.confirm('¿Quieres salir de la sala?')) {
    leaveRoom({ keepUrl: true });
    set({ inviteCode: code });
  } else {
    // Se queda: se vuelve a poner la ruta de la sala.
    window.history.pushState(null, '', roomSharePath(joined.code));
  }
}

// --- Arranque ---------------------------------------------------------------

/** Una sola vez, antes de pintar: lee identidad y URL, y abre el socket. */
export function initClient(): void {
  if (started) return;
  started = true;

  const inviteCode = parseRoomPath(window.location.pathname);
  const saved = loadSavedRoom(tab);
  set({ nickname: loadNickname(local), inviteCode });

  // Recarga dentro de una sala: la URL sigue siendo la de esa sala. Cualquier otra ruta descarta lo guardado.
  if (saved && inviteCode === saved.code) {
    joined = saved;
    set({ resuming: true, inviteCode: null });
  } else if (saved) {
    clearSavedRoom(tab);
  }

  connectSocket();
  startSoundDriver();
  window.addEventListener('popstate', onPopState);
}

// --- Acciones de la interfaz ------------------------------------------------

function emitWhenReady(send: (s: DyaSocket) => void): void {
  if (socket?.connected && ready) send(socket);
}

export const actions = {
  setNickname(name: string): void {
    set({ nickname: name });
    saveNickname(local, name);
  },
  createRoom(name: string): void {
    requestRoom('room:create', { name });
  },
  joinRoom(code: string, name: string): void {
    requestRoom('room:join', { code, name });
  },
  startGame(): void {
    emitWhenReady((s) => s.emit('game:start'));
  },
  changeSettings(settings: GameSettings): void {
    emitWhenReady((s) => s.emit('room:settings', settings));
  },
  chooseWord(index: number): void {
    emitWhenReady((s) => s.emit('word:choose', { index }));
  },
  sendMessage(text: string): void {
    emitWhenReady((s) => s.emit('message:send', { text }));
  },
  strokeStart(payload: StrokeStartPayload): void {
    emitWhenReady((s) => s.emit('stroke:start', payload));
  },
  strokePoints(payload: StrokePointsPayload): void {
    emitWhenReady((s) => s.emit('stroke:points', payload));
  },
  strokeEnd(payload: StrokeEndPayload): void {
    emitWhenReady((s) => s.emit('stroke:end', payload));
  },
  undo(): void {
    emitWhenReady((s) => s.emit('canvas:undo'));
  },
  clear(): void {
    emitWhenReady((s) => s.emit('canvas:clear'));
  },
  leaveRoom(): void {
    leaveRoom();
  },
  /** "Retomar aquí": vuelve a abrir la conexión que el servidor cerró por abrirse en otra pestaña. */
  resumeHere(): void {
    set({ takenOver: false, status: 'connecting' });
    socket?.connect();
  },
  /** Abandona el intento de volver a la sala tras recargar. */
  cancelResume(): void {
    if (joined) leaveRoom();
    else set({ resuming: false });
  },
  dismissHomeError(): void {
    set({ homeError: null });
  },
  dismissRoomError(): void {
    set({ roomError: null });
  },
};
