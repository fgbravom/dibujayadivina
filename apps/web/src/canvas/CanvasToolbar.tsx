import { PALETTE, STROKE_SIZES, type PaletteColor, type StrokeSize } from '@dya/shared';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { DrawingTool } from './types';
import { DESK_QUERY, useMediaQuery } from '../ui/hooks/useMediaQuery';

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

// Objetivo táctil mínimo de 44 px (h-11 / min-w-11). El foco visible viene del `:focus-visible` global.
const BUTTON_BASE =
  'inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const BUTTON_IDLE = 'bg-card text-ink hover:bg-sol-soft active:bg-sol';
const BUTTON_SELECTED = 'bg-ink text-white';
const SELECTED_TEXT_STYLE = { color: '#ffffff' } as const;

const FOLDED_ITEM = 'min-w-11 flex-1 land:h-11 land:w-11 land:flex-none';

type Open = 'color' | 'size' | null;

function IconButton({
  label,
  selected,
  disabled,
  onClick,
  className = '',
  children,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
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
      className={`${BUTTON_BASE} w-11 ${selected ? BUTTON_SELECTED : BUTTON_IDLE} ${className}`}
      // Inline: así el blanco no depende del orden de las capas de CSS.
      style={selected ? SELECTED_TEXT_STYLE : undefined}
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

/** Flechita que avisa que el botón abre un panel. */
function CaretIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="land:hidden"
    >
      <path d="M2.5 7.5L6 4l3.5 3.5" />
    </svg>
  );
}

function CheckMark({ color }: { color: string }) {
  return (
    <svg
      {...iconProps}
      strokeWidth={3}
      className={color === '#ffffff' || color === '#fcbf49' ? 'text-ink' : 'text-white'}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Barra de herramientas del dibujante. Es controlada: el estado de la herramienta vive en quien la
 * usa. En escritorio muestra todo desplegado; en teléfono es una sola fila (color, grosor, goma,
 * deshacer, limpiar) y la paleta y los grosores se abren en un panel sobre el lienzo.
 */
export function CanvasToolbar({
  tool,
  onToolChange,
  onUndo,
  onClear,
  disabled = false,
  className = '',
}: CanvasToolbarProps) {
  const unfolded = useMediaQuery(DESK_QUERY);
  const isEraser = tool.tool === 'eraser';

  const rootRef = useRef<HTMLDivElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const sizeTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [openState, setOpen] = useState<Open>(null);
  // Sin conexión (o en escritorio) no hay panel abierto, sin necesidad de un efecto que lo cierre.
  const open = disabled || unfolded ? null : openState;

  // Al abrir el panel, el foco pasa a la opción elegida (o a la primera) para poder usarlo con teclado.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ??
      panel?.querySelector<HTMLButtonElement>('button');
    target?.focus();
  }, [open]);

  /** Cierra el panel; con `restoreFocus` el foco vuelve al botón que lo abrió (teclado). */
  const close = (restoreFocus: boolean) => {
    const was = openState;
    setOpen(null);
    if (restoreFocus && was) (was === 'color' ? colorTriggerRef : sizeTriggerRef).current?.focus();
  };

  const toggle = (which: Exclude<Open, null>) => setOpen((cur) => (cur === which ? null : which));

  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close(true);
    }
  };

  // Si el foco sale de la barra (Tab hacia otro lado), el panel se cierra.
  const onRootBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (open && next && !rootRef.current?.contains(next)) setOpen(null);
  };

  /** Flechas, Inicio y Fin mueven el foco entre las opciones del panel. */
  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (items.length === 0) return;
    e.preventDefault();
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else next = items.length - 1;
    items[next]?.focus();
  };

  const pickColor = (color: PaletteColor) => {
    onToolChange({ ...tool, color, tool: 'brush' });
    close(true);
  };

  const pickSize = (size: StrokeSize) => {
    onToolChange({ ...tool, size });
    close(true);
  };

  const colorButtons = PALETTE.map((color) => {
    const selected = !isEraser && tool.color === color;
    return (
      <button
        key={color}
        type="button"
        aria-label={`Color ${COLOR_NAMES[color]}`}
        title={`Color ${COLOR_NAMES[color]}`}
        aria-pressed={selected}
        disabled={disabled}
        onClick={() =>
          unfolded ? onToolChange({ ...tool, color, tool: 'brush' }) : pickColor(color)
        }
        className={`${BUTTON_BASE} w-full ${selected ? 'ring-2 ring-ink ring-offset-2' : ''}`}
        style={{ backgroundColor: color }}
      >
        {selected && <CheckMark color={color} />}
      </button>
    );
  });

  const sizeDot = (size: StrokeSize) => (
    <span
      aria-hidden="true"
      className="block rounded-full bg-current"
      style={{ width: SIZE_DOT[size], height: SIZE_DOT[size] }}
    />
  );

  const sizeButtons = STROKE_SIZES.map((size) => (
    <IconButton
      key={size}
      label={`Grosor ${SIZE_LABELS[size]}`}
      selected={tool.size === size}
      disabled={disabled}
      onClick={() => (unfolded ? onToolChange({ ...tool, size }) : pickSize(size))}
      className={unfolded ? '' : 'w-full'}
    >
      {sizeDot(size)}
    </IconButton>
  ));

  const eraserButton = (
    <IconButton
      label="Goma"
      selected={isEraser}
      disabled={disabled}
      onClick={() => {
        onToolChange({ ...tool, tool: isEraser ? 'brush' : 'eraser' });
        setOpen(null);
      }}
      className={unfolded ? '' : FOLDED_ITEM}
    >
      <EraserIcon />
    </IconButton>
  );
  const undoButton = (
    <IconButton
      label="Deshacer"
      disabled={disabled}
      onClick={() => {
        onUndo();
        setOpen(null);
      }}
      className={unfolded ? '' : FOLDED_ITEM}
    >
      <UndoIcon />
    </IconButton>
  );
  const clearButton = (
    <IconButton
      label="Limpiar lienzo"
      disabled={disabled}
      onClick={() => {
        setOpen(null);
        onClear();
      }}
      className={unfolded ? '' : FOLDED_ITEM}
    >
      <TrashIcon />
    </IconButton>
  );

  if (unfolded) {
    return (
      <div
        role="toolbar"
        aria-label="Herramientas de dibujo"
        className={`flex flex-col gap-2 ${className}`}
      >
        <div role="group" aria-label="Colores" className="grid grid-cols-12 gap-1">
          {colorButtons}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <div role="group" aria-label="Grosor" className="flex gap-1">
            {sizeButtons}
          </div>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-ink/30" />
          {eraserButton}
          {undoButton}
          {clearButton}
        </div>
      </div>
    );
  }

  const colorName = COLOR_NAMES[tool.color as PaletteColor] ?? tool.color;
  const popoverClass =
    'absolute bottom-full left-0 right-0 z-10 mb-2 grid gap-2 rounded-2xl border-2 border-ink ' +
    'bg-card p-2 shadow-pop land:bottom-auto land:top-0 land:right-auto land:left-full land:mb-0 land:ml-2';

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Herramientas de dibujo"
      data-testid="canvas-toolbar"
      onKeyDown={onRootKeyDown}
      onBlur={onRootBlur}
      // z-30 propio: el telón (z -1 dentro de esta capa) tapa el resto de la pantalla pero no la barra.
      className={`relative z-30 flex items-center gap-2 land:flex-col ${className}`}
    >
      {open && (
        <div
          aria-hidden="true"
          data-testid="toolbar-backdrop"
          className="fixed inset-0 -z-10"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            // Tocar fuera solo cierra: no debe empezar un trazo en el lienzo que hay debajo.
            e.preventDefault();
            e.stopPropagation();
            setOpen(null);
          }}
        />
      )}

      <button
        ref={colorTriggerRef}
        type="button"
        data-testid="color-trigger"
        aria-label={`Elegir color (actual: ${colorName})`}
        title="Elegir color"
        aria-haspopup="true"
        aria-expanded={open === 'color'}
        aria-controls={open === 'color' ? panelId : undefined}
        disabled={disabled}
        onClick={() => toggle('color')}
        className={`${BUTTON_BASE} gap-1 px-2 ${FOLDED_ITEM} ${open === 'color' ? 'bg-sol-soft' : BUTTON_IDLE}`}
      >
        <span
          aria-hidden="true"
          className="block size-7 rounded-full border-2 border-ink"
          style={{ backgroundColor: tool.color }}
        />
        <CaretIcon />
      </button>

      <button
        ref={sizeTriggerRef}
        type="button"
        data-testid="size-trigger"
        aria-label={`Elegir grosor (actual: ${SIZE_LABELS[tool.size]})`}
        title="Elegir grosor"
        aria-haspopup="true"
        aria-expanded={open === 'size'}
        aria-controls={open === 'size' ? panelId : undefined}
        disabled={disabled}
        onClick={() => toggle('size')}
        className={`${BUTTON_BASE} gap-1 px-2 ${FOLDED_ITEM} ${open === 'size' ? 'bg-sol-soft' : BUTTON_IDLE}`}
      >
        <span className="flex size-7 items-center justify-center">{sizeDot(tool.size)}</span>
        <CaretIcon />
      </button>

      {eraserButton}
      {undoButton}
      {clearButton}

      {open === 'color' && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="Colores"
          data-testid="color-panel"
          onKeyDown={onPanelKeyDown}
          className={`${popoverClass} grid-cols-6 land:w-[14.5rem] land:grid-cols-4`}
        >
          {colorButtons}
        </div>
      )}
      {open === 'size' && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="Grosor"
          data-testid="size-panel"
          onKeyDown={onPanelKeyDown}
          className={`${popoverClass} grid-cols-4 land:w-[12rem]`}
        >
          {sizeButtons}
        </div>
      )}
    </div>
  );
}
