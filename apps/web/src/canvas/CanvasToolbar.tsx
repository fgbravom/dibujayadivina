import { PALETTE, STROKE_SIZES, type PaletteColor, type StrokeSize } from '@dya/shared';
import type { ReactNode } from 'react';
import type { DrawingTool } from './types';

export type CanvasToolbarProps = {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onUndo: () => void;
  onClear: () => void;
  /** Deshabilita toda la barra (p. ej. cuando no es tu turno). */
  disabled?: boolean;
  className?: string;
};

const COLOR_NAMES: Record<PaletteColor, string> = {
  '#000000': 'negro',
  '#ffffff': 'blanco',
  '#7f7f7f': 'gris',
  '#e63946': 'rojo',
  '#f77f00': 'naranja',
  '#fcbf49': 'amarillo',
  '#2a9d8f': 'verde',
  '#1d3557': 'azul marino',
  '#457b9d': 'celeste',
  '#7b2cbf': 'morado',
  '#f28ab2': 'rosado',
  '#8b5a2b': 'café',
};

const SIZE_LABELS: Record<StrokeSize, string> = {
  4: 'fino',
  8: 'mediano',
  16: 'grueso',
  32: 'extra grueso',
};

/** Diámetro (px de pantalla) del punto que representa cada grosor dentro del botón. */
const SIZE_DOT: Record<StrokeSize, number> = { 4: 6, 8: 10, 16: 16, 32: 26 };

const BUTTON_BASE =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-lg border transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-40';
const BUTTON_IDLE =
  'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 active:bg-slate-200';
const BUTTON_SELECTED = 'border-slate-900 bg-slate-900 text-white';

function IconButton({
  label,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`${BUTTON_BASE} w-11 ${selected ? BUTTON_SELECTED : BUTTON_IDLE}`}
      // Inline: un `button { color: inherit }` global sin capa le gana a las utilidades de Tailwind.
      style={selected ? { color: '#ffffff' } : undefined}
    >
      {children}
    </button>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function EraserIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20 20H9l-5-5a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L12 20" />
      <path d="M8 9.5l6.5 6.5" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  );
}

/** Barra de herramientas del dibujante. Es controlada: el estado de la herramienta vive en quien la usa. */
export function CanvasToolbar({
  tool,
  onToolChange,
  onUndo,
  onClear,
  disabled = false,
  className = '',
}: CanvasToolbarProps) {
  const isEraser = tool.tool === 'eraser';

  return (
    <div
      role="toolbar"
      aria-label="Herramientas de dibujo"
      className={`flex flex-col gap-2 ${className}`}
    >
      <div role="group" aria-label="Colores" className="grid grid-cols-6 gap-1 sm:grid-cols-12">
        {PALETTE.map((color) => {
          const selected = !isEraser && tool.color === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={`Color ${COLOR_NAMES[color]}`}
              title={`Color ${COLOR_NAMES[color]}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onToolChange({ ...tool, color, tool: 'brush' })}
              className={`${BUTTON_BASE} w-full min-w-11 border-slate-300 ${
                selected ? 'ring-2 ring-slate-900 ring-offset-2' : ''
              }`}
              style={{ backgroundColor: color }}
            >
              {selected && (
                <svg
                  {...iconProps}
                  strokeWidth={3}
                  className={
                    color === '#ffffff' || color === '#fcbf49' ? 'text-slate-900' : 'text-white'
                  }
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <div role="group" aria-label="Grosor" className="flex gap-1">
          {STROKE_SIZES.map((size) => (
            <IconButton
              key={size}
              label={`Grosor ${SIZE_LABELS[size]}`}
              selected={tool.size === size}
              disabled={disabled}
              onClick={() => onToolChange({ ...tool, size })}
            >
              <span
                aria-hidden="true"
                className="block rounded-full bg-current"
                style={{ width: SIZE_DOT[size], height: SIZE_DOT[size] }}
              />
            </IconButton>
          ))}
        </div>

        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-slate-300 sm:block" />

        <IconButton
          label="Goma"
          selected={isEraser}
          disabled={disabled}
          onClick={() => onToolChange({ ...tool, tool: isEraser ? 'brush' : 'eraser' })}
        >
          <EraserIcon />
        </IconButton>
        <IconButton label="Deshacer" disabled={disabled} onClick={onUndo}>
          <UndoIcon />
        </IconButton>
        <IconButton label="Limpiar lienzo" disabled={disabled} onClick={onClear}>
          <TrashIcon />
        </IconButton>
      </div>
    </div>
  );
}
