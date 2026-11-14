import { useEffect, useId, useState, type FormEvent } from 'react';
import { NICKNAME_MAX_LENGTH, ROOM_CODE_LENGTH, type ErrorCode } from '@dya/shared';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { Logo } from '../components/Logo';
import { ReconnectBanner } from '../components/ReconnectBanner';
import {
  isRoomCodeComplete,
  nicknameProblemText,
  normalizeNickname,
  normalizeRoomCode,
  validateNickname,
} from '../lib/nickname';

export type HomeScreenProps = {
  /** Apodo con el que parte el campo (por ejemplo, el último que usó la persona). */
  initialName?: string;
  /**
   * Código de sala que llegó por enlace (`/sala/ABCD`). Con código, la pantalla pasa a la variante
   * "te invitaron": solo pide el apodo y entra a esa sala.
   */
  inviteCode?: string | null;
  /** Último error de `room:create` / `room:join` (o `system:error`). */
  error?: ErrorCode | null;
  onDismissError?: () => void;
  /** Hay una petición en curso: se bloquean los botones. */
  busy?: boolean;
  /** `false` muestra el aviso de reconexión y bloquea los botones. */
  connected?: boolean;
  /** Cantidad de personas conectadas al servidor en este momento. */
  onlineCount?: number | null;
  /** Recibe el apodo ya recortado y validado. */
  onCreateRoom: (name: string) => void;
  /** Recibe el código en mayúsculas (4 letras) y el apodo recortado y validado. */
  onJoinRoom: (code: string, name: string) => void;
  /** Se llama en cada cambio del apodo, por si quien conecta quiere recordarlo. */
  onNameChange?: (name: string) => void;
};

const fieldClass =
  'h-12 w-full rounded-xl border-2 border-ink bg-card px-3 text-base font-bold aria-[invalid=true]:border-copihue';

export function HomeScreen({
  initialName = '',
  inviteCode = null,
  error = null,
  onDismissError,
  busy = false,
  connected = true,
  onlineCount = null,
  onCreateRoom,
  onJoinRoom,
  onNameChange,
}: HomeScreenProps) {
  const nameId = useId();
  const codeId = useId();
  const nameErrorId = useId();
  const codeErrorId = useId();
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState('');
  // Los errores de validación aparecen recién al intentar enviar, no mientras se escribe.
  const [attempted, setAttempted] = useState<'create' | 'join' | null>(null);

  // El botón flotante de Buy Me a Coffee se muestra solo en la portada: lo controla el CSS con esta clase.
  useEffect(() => {
    document.documentElement.classList.add('home-screen');
    return () => document.documentElement.classList.remove('home-screen');
  }, []);

  const invitedCode = normalizeRoomCode(inviteCode ?? '');
  const invited = invitedCode !== '';
  const blocked = busy || !connected;
  const nameProblem = validateNickname(name);
  const showNameProblem = attempted !== null && nameProblem !== null;
  const codeIncomplete = !isRoomCodeComplete(code);
  const showCodeProblem = attempted === 'join' && codeIncomplete;

  const create = () => {
    setAttempted('create');
    if (nameProblem !== null) return;
    onCreateRoom(normalizeNickname(name));
  };

  const join = () => {
    setAttempted('join');
    if (nameProblem !== null) return;
    if (invited) {
      onJoinRoom(invitedCode, normalizeNickname(name));
      return;
    }
    if (codeIncomplete) return;
    onJoinRoom(code, normalizeNickname(name));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    // Enter: con código escrito entra a esa sala; si no, crea una nueva (o entra, si vino por enlace).
    if (invited || code !== '') join();
    else create();
  };

  return (
    <div className="safe-pad flex min-h-(--app-h) flex-col">
      <ReconnectBanner connected={connected} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-8">
        <div className="flex flex-col items-center gap-3">
          <Logo />
          {connected && onlineCount !== null && onlineCount > 0 && (
            <div
              data-testid="online-count"
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-card px-3 py-1 text-xs font-extrabold text-ink shadow-pop-sm"
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full border border-ink bg-pasto"
              />
              <span className="tabular-nums">
                {onlineCount === 1 ? '1 jugador online' : `${onlineCount} jugadores online`}
              </span>
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          noValidate
          data-testid="home-form"
          className="flex flex-col gap-5 rounded-2xl border-2 border-ink bg-card p-5 shadow-pop"
        >
          {invited && (
            <div
              data-testid="invite-banner"
              className="rounded-xl border-2 border-ink bg-sol-soft p-3 text-center"
            >
              <p className="text-sm font-bold text-ink-soft">Te invitaron a la sala</p>
              <p
                className="text-3xl font-black tracking-[0.3em]"
                aria-label={`Código ${invitedCode}`}
              >
                {invitedCode}
              </p>
            </div>
          )}

          <ErrorNotice error={error} onDismiss={onDismissError} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="font-extrabold">
              ¿Cómo te llamamos?
            </label>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                onNameChange?.(e.target.value);
              }}
              maxLength={NICKNAME_MAX_LENGTH}
              placeholder="Tu apodo"
              autoComplete="nickname"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint={invited ? 'go' : 'done'}
              aria-invalid={showNameProblem}
              aria-describedby={showNameProblem ? nameErrorId : undefined}
              className={fieldClass}
            />
            {showNameProblem && nameProblem && (
              <p id={nameErrorId} role="alert" className="text-sm font-bold text-copihue-dark">
                {nicknameProblemText(nameProblem)}
              </p>
            )}
          </div>

          {invited ? (
            <div className="flex flex-col gap-3">
              <Button type="submit" variant="primary" size="lg" disabled={blocked}>
                {busy ? 'Entrando…' : 'Entrar a la sala'}
              </Button>
              <Button variant="ghost" onClick={create} disabled={blocked}>
                Mejor creo mi propia sala
              </Button>
            </div>
          ) : (
            <>
              <Button variant="primary" size="lg" onClick={create} disabled={blocked}>
                {busy && attempted === 'create' ? 'Creando…' : 'Crear sala nueva'}
              </Button>

              <div
                className="flex items-center gap-3 text-sm font-extrabold text-ink-soft"
                aria-hidden="true"
              >
                <span className="h-0.5 flex-1 bg-ink/20" />o
                <span className="h-0.5 flex-1 bg-ink/20" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={codeId} className="font-extrabold">
                  Unirme con un código
                </label>
                <div className="flex gap-2">
                  <input
                    id={codeId}
                    type="text"
                    value={code}
                    onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
                    maxLength={ROOM_CODE_LENGTH * 2}
                    placeholder="ABCD"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    enterKeyHint="go"
                    aria-invalid={showCodeProblem}
                    aria-describedby={showCodeProblem ? codeErrorId : undefined}
                    className={`${fieldClass} w-32 text-center font-black uppercase tracking-[0.3em]`}
                  />
                  <Button
                    type="submit"
                    variant="sol"
                    size="lg"
                    disabled={blocked}
                    className="flex-1"
                  >
                    {busy && attempted === 'join' ? 'Entrando…' : 'Unirme'}
                  </Button>
                </div>
                {showCodeProblem && (
                  <p id={codeErrorId} role="alert" className="text-sm font-bold text-copihue-dark">
                    El código tiene {ROOM_CODE_LENGTH} letras.
                  </p>
                )}
              </div>
            </>
          )}
        </form>

        <p className="text-center text-sm font-bold text-ink-soft">
          Sin registro: eliges un apodo, compartes el código y a dibujar.
        </p>
      </main>
    </div>
  );
}
