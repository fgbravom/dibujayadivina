// Ayudas para las pruebas: jugadores (un contexto de navegador cada uno) y los pasos comunes de la
// interfaz. Sin esperas fijas: todo se espera con condiciones.

import {
  devices,
  expect,
  test as base,
  type BrowserContext,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';

export type Phase = 'CHOOSING' | 'DRAWING' | 'TURN_END';

/** Palabras fijas del servidor de pruebas (scripts/serve.mjs): opciones de los tres primeros turnos. */
export const WORDS = [
  ['huemul', 'cueca', 'micro'],
  ['copihue', 'sopaipilla', 'volantin'],
  ['guata', 'polera', 'completo'],
] as const;

/** Trazos de ejemplo en fracciones del lienzo: un zigzag y, como variante, otro que no lo pisa. */
const SCRIBBLES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [0.15, 0.2],
    [0.85, 0.3],
    [0.25, 0.55],
    [0.8, 0.8],
  ],
  [
    [0.1, 0.9],
    [0.5, 0.65],
    [0.9, 0.9],
    [0.9, 0.1],
  ],
];

export class Player {
  /** Todo lo que el servidor le envió a este navegador (sockets y sondeo), para buscar fugas. */
  readonly received: string[] = [];
  private cdp: CDPSession | null = null;

  constructor(
    readonly name: string,
    readonly page: Page,
    readonly context: BrowserContext,
    readonly isPhone: boolean,
    private readonly browserName: string,
  ) {
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => this.received.push(String(frame.payload)));
    });
    page.on('response', (response) => {
      if (!response.url().includes('/socket.io/')) return;
      response
        .text()
        .then((body) => this.received.push(body))
        .catch(() => undefined);
    });
  }

  // --- Lectura de la pantalla -------------------------------------------------

  get feed(): Locator {
    return this.page.getByTestId('message-feed');
  }

  get composerInput(): Locator {
    return this.page.getByTestId('composer').getByRole('textbox');
  }

  get gameScreen(): Locator {
    return this.page.getByTestId('game-screen');
  }

  get turnEnd(): Locator {
    return this.page.getByTestId('turn-end');
  }

  /** Fila de la lista de jugadores de escritorio (solo para contextos de escritorio). */
  playerRow(name: string): Locator {
    return this.page.getByTestId('player-column').getByRole('listitem').filter({ hasText: name });
  }

  async expectPhase(phase: Phase): Promise<void> {
    await expect(this.gameScreen).toHaveAttribute('data-phase', phase);
  }

  async expectScore(name: string, score: number): Promise<void> {
    await expect(this.playerRow(name)).toContainText(new RegExp(`(?<!\\d)${score}\\s*pts`));
  }

  async clockSeconds(): Promise<number> {
    const text = await this.page.getByTestId('clock').textContent();
    const match = /(\d+):(\d{2})/.exec(text ?? '');
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
  }

  /** Píxeles del lienzo que no son blancos ni transparentes (0 = lienzo vacío). */
  async ink(): Promise<number> {
    return this.page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0 || canvas.height === 0) return 0;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 0 && (data[i]! < 240 || data[i + 1]! < 240 || data[i + 2]! < 240)) {
          count += 1;
        }
      }
      return count;
    });
  }

  /** Texto completo de lo que recibió del servidor, en minúsculas. */
  receivedText(): string {
    return this.received.join('\n').toLowerCase();
  }

  // --- Acciones ----------------------------------------------------------------

  /** Escribe en el campo único de texto y envía con Enter. */
  async say(text: string): Promise<void> {
    await this.composerInput.fill(text);
    await this.composerInput.press('Enter');
    await expect(this.composerInput).toHaveValue('');
  }

  async chooseWord(index: number): Promise<void> {
    await this.page.getByTestId(`word-option-${index}`).click();
  }

  /** Dibuja un trazo de ejemplo: con toques reales en el teléfono (Chromium) o con el mouse. */
  async scribble(variant: 0 | 1 = 0): Promise<void> {
    const canvas = this.page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error(`${this.name}: el lienzo no tiene caja`);
    const points = SCRIBBLES[variant]!.map(([fx, fy]) => ({
      x: box.x + box.width * fx,
      y: box.y + box.height * fy,
    }));
    const first = points[0]!;
    if (this.isPhone && this.browserName === 'chromium') {
      this.cdp ??= await this.context.newCDPSession(this.page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
        this.cdp!.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
        });
      await touch('touchStart', first);
      for (const p of points.slice(1)) {
        await touch('touchMove', p);
        await this.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      }
      await touch('touchEnd');
      return;
    }
    await this.page.mouse.move(first.x, first.y);
    await this.page.mouse.down();
    for (const p of points.slice(1)) await this.page.mouse.move(p.x, p.y, { steps: 8 });
    await this.page.mouse.up();
  }
}

export type NewPlayer = (name: string, options?: { phone?: boolean }) => Promise<Player>;

export const test = base.extend<{ newPlayer: NewPlayer }>({
  newPlayer: async ({ browser, browserName }, use) => {
    const contexts: BrowserContext[] = [];
    const create: NewPlayer = async (name, options = {}) => {
      let context: BrowserContext;
      if (options.phone) {
        // Teléfono: Pixel 7 en Chromium, iPhone 14 en WebKit (tamaño, táctil y agente de usuario).
        const { defaultBrowserType: _ignored, ...phone } =
          browserName === 'webkit' ? devices['iPhone 14'] : devices['Pixel 7'];
        context = await browser.newContext(phone);
      } else {
        context = await browser.newContext();
      }
      contexts.push(context);
      const page = await context.newPage();
      return new Player(name, page, context, options.phone ?? false, browserName);
    };
    await use(create);
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect };

// --- Pasos comunes -------------------------------------------------------------

/** Crea una sala desde el inicio y devuelve su código. */
export async function createRoom(host: Player): Promise<string> {
  await host.page.goto('/');
  await host.page.getByLabel('¿Cómo te llamamos?').fill(host.name);
  await host.page.getByRole('button', { name: 'Crear sala nueva' }).click();
  const code = host.page.getByTestId('room-code');
  await expect(code).toHaveText(/^[A-Z]{4}$/);
  const text = (await code.textContent()) ?? '';
  await expect(host.page).toHaveURL(new RegExp(`/sala/${text}$`));
  return text;
}

/** Abre el enlace de la sala y entra con el apodo del jugador (sin esperar a una pantalla en particular). */
export async function openInvite(player: Player, code: string): Promise<void> {
  await player.page.goto(`/sala/${code}`);
  await expect(player.page.getByTestId('invite-banner')).toContainText(code);
  await player.page.getByLabel('¿Cómo te llamamos?').fill(player.name);
  await player.page.getByRole('button', { name: 'Entrar a la sala' }).click();
}

/** Entra a una sala que aún está en la sala de espera. */
export async function joinByLink(player: Player, code: string): Promise<void> {
  await openInvite(player, code);
  await expect(player.page.getByTestId('room-code')).toHaveText(code);
}

/** Crea la sala con el primero y mete al resto por enlace; todos quedan en la sala de espera. */
export async function openLobby(players: Player[]): Promise<string> {
  const [host, ...guests] = players;
  const code = await createRoom(host!);
  for (const guest of guests) await joinByLink(guest, code);
  for (const p of players) {
    for (const other of players) {
      await expect(p.page.getByTestId('lobby-players')).toContainText(other.name);
    }
  }
  return code;
}

export async function startGame(host: Player): Promise<void> {
  const start = host.page.getByTestId('start-button');
  await expect(start).toBeEnabled();
  await start.click();
}

/**
 * Arma la sala, inicia la partida y deja el primer turno en DRAWING con la primera opción elegida.
 * El primero de `players` es anfitrión y primer dibujante.
 */
export async function startDrawing(players: Player[], wordIndex = 0): Promise<string> {
  const code = await openLobby(players);
  const [drawer, ...guessers] = players;
  await startGame(drawer!);
  await expect(drawer!.page.getByTestId('choosing-drawer')).toBeVisible();
  await drawer!.chooseWord(wordIndex);
  await drawer!.expectPhase('DRAWING');
  for (const g of guessers) await g.expectPhase('DRAWING');
  return code;
}
