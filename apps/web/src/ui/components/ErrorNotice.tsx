import type { ErrorCode } from '@dya/shared';
import { errorMessage } from '../lib/errors';

type ErrorNoticeProps = {
  error: ErrorCode | null | undefined;
  onDismiss?: () => void;
};

/** Error del servidor traducido a español. `role="alert"` para que se anuncie solo. */
export function ErrorNotice({ error, onDismiss }: ErrorNoticeProps) {
  if (!error) return null;
  return (
    <div
      role="alert"
      data-testid="error-notice"
      className="flex items-start gap-3 rounded-xl border-2 border-ink bg-copihue-soft p-3 text-sm font-bold text-ink shadow-pop-sm"
    >
      <span className="flex-1">{errorMessage(error)}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-xl font-black leading-none hover:bg-copihue/10"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
