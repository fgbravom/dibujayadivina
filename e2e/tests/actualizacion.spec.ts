// Versión nueva del juego: un despliegue simulado (el `index.html` que recibe la comprobación apunta
// a otro script) más un corte del socket. En una sala solo avisa; en el inicio recarga una sola vez.
// Solo Chromium (los sockets se cortan con `routeWebSocket`).

import type { Locator, Page, WebSocketRoute } from '@playwright/test';
import { createRoom, expect, startDrawing, test, type Player } from '../support/game';

test.skip(({ browserName }) => browserName !== 'chromium', 'solo Chromium');

const DEPLOYED_SCRIPT = '/assets/index-DESPLEGADO.js';

/**
 * Toma el control de la red de una página: sirve el `index.html` de la comprobación con otro script
 * cuando `state.deployed` es true, y deja cortar el socket para forzar una reconexión. Debe
 * instalarse antes de abrir la página.
 */
async function controlNetwork(page: Page) {
  const state = { deployed: false, checks: 0, navigations: 0 };
  const live: WebSocketRoute[] = [];

  // Socket.IO abre primero un WebSocket de prueba y lo adopta al enviar el paquete `5` (upgrade):
  // recién entonces es el transporte real y vale la pena cortarlo.
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      server.send(message);
      if (message === '5') live.push(ws);
    });
    server.onMessage((message) => ws.send(message));
    ws.onClose((code, reason) => {
      const index = live.indexOf(ws);
      if (index >= 0) live.splice(index, 1);
      void server.close({ code, reason });
    });
    server.onClose((code, reason) => void ws.close({ code, reason }));
  });

  await page.route('**/index.html', async (route) => {
    state.checks += 1;
    const response = await route.fetch();
    let body = await response.text();
    if (state.deployed) body = body.replace(/\/assets\/index-[\w-]+\.js/, DEPLOYED_SCRIPT);
    await route.fulfill({ response, body });
  });

  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      state.navigations += 1;
    }
  });

  return {
    state,
    /** Corta el socket abierto (la página reconecta sola). */
    async cut(): Promise<void> {
      await expect.poll(() => live.length).toBeGreaterThan(0);
      const [socket] = live;
      socket!.close();
      await expect.poll(() => live.includes(socket!)).toBe(false);
    },
    /** Corta el socket abierto y espera a que el navegador vuelva a abrir uno. */
    async reconnect(): Promise<void> {
      await this.cut();
      await expect.poll(() => live.length).toBeGreaterThan(0);
    },
    /** Deja que la página procese lo que ya recibió (dos cuadros de animación). */
    async settle(): Promise<void> {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    },
  };
}

function updateNotice(page: Page): Locator {
  return page.getByTestId('update-notice');
}

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const result = await locator.boundingBox();
  if (!result) throw new Error('el elemento no tiene caja');
  return result;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function expectNoticeInRoom(player: Player, net: Awaited<ReturnType<typeof controlNetwork>>) {
  net.state.deployed = true;
  await net.reconnect();
  const notice = updateNotice(player.page);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Hay una versión nueva del juego');
  await expect(notice.getByRole('button', { name: 'Actualizar' })).toBeVisible();
  return notice;
}

test.describe('versión nueva del juego', () => {
  test('en una sala avisa sin recargar, el aviso vuelve tras cerrarlo y "Actualizar" regresa a la misma sala', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const net = await controlNetwork(ana.page);
    const code = await createRoom(ana);
    const notice = updateNotice(ana.page);
    await expect(notice).toHaveCount(0);

    await expectNoticeInRoom(ana, net);
    expect(net.state.navigations).toBe(1);

    // Se puede cerrar, pero no para siempre: vuelve en la siguiente comprobación.
    await notice.getByRole('button', { name: 'Cerrar aviso de versión nueva' }).click();
    await expect(notice).toHaveCount(0);
    await net.reconnect();
    await expect(notice).toBeVisible();
    expect(net.state.navigations).toBe(1);

    // Actualizar recarga la página y la persona vuelve sola a su sala.
    await notice.getByRole('button', { name: 'Actualizar' }).click();
    await expect.poll(() => net.state.navigations).toBe(2);
    await expect(ana.page.getByTestId('room-code')).toHaveText(code);
    await expect(ana.page).toHaveURL(new RegExp(`/sala/${code}$`));
    await expect(updateNotice(ana.page)).toHaveCount(0);
  });

  test('en una partida, en un teléfono de 360 px, el aviso no tapa el lienzo ni el campo de texto', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const beto = await newPlayer('Beto', { phone: true });
    const cami = await newPlayer('Cami');
    await beto.page.setViewportSize({ width: 360, height: 640 });
    const net = await controlNetwork(beto.page);
    await startDrawing([ana, beto, cami]);

    const notice = await expectNoticeInRoom(beto, net);
    await beto.expectPhase('DRAWING');

    const noticeBox = await box(notice);
    const canvas = beto.page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(beto.composerInput).toBeVisible();
    expect(overlaps(noticeBox, await box(canvas))).toBe(false);
    expect(overlaps(noticeBox, await box(beto.composerInput))).toBe(false);
    expect(noticeBox.x).toBeGreaterThanOrEqual(0);
    expect(noticeBox.x + noticeBox.width).toBeLessThanOrEqual(360);

    // Sigue pudiendo adivinar con el aviso a la vista.
    await beto.say('perro');
    await expect(ana.feed).toContainText('perro');
  });

  test('en el inicio se recarga sola una sola vez y no entra en bucle', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana');
    const net = await controlNetwork(ana.page);
    await ana.page.goto('/');
    const create = ana.page.getByRole('button', { name: 'Crear sala nueva' });
    await expect(create).toBeVisible();
    expect(net.state.navigations).toBe(1);

    net.state.deployed = true;
    await net.cut();
    await expect.poll(() => net.state.navigations).toBe(2);
    await expect(create).toBeVisible();
    await expect(updateNotice(ana.page)).toHaveCount(0);

    // La página nueva sigue viendo "otra versión" (el servidor de pruebas no cambió): no recarga de nuevo.
    for (let i = 0; i < 2; i += 1) {
      const checks = net.state.checks;
      await net.reconnect();
      await expect.poll(() => net.state.checks).toBeGreaterThan(checks);
      await net.settle();
    }
    expect(net.state.navigations).toBe(2);
    await expect(create).toBeVisible();
  });

  test('en el inicio conserva la URL de invitación y el error visible al recargar', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const net = await controlNetwork(ana.page);
    await ana.page.goto('/sala/XXXX');
    await ana.page.getByLabel('¿Cómo te llamamos?').fill(ana.name);
    await ana.page.getByRole('button', { name: 'Entrar a la sala' }).click();
    const error = ana.page.getByTestId('error-notice');
    await expect(error).toContainText('No encontramos esa sala');

    net.state.deployed = true;
    await net.cut();
    await expect.poll(() => net.state.navigations).toBe(2);

    await expect(ana.page).toHaveURL(/\/sala\/XXXX$/);
    await expect(ana.page.getByTestId('invite-banner')).toContainText('XXXX');
    await expect(error).toContainText('No encontramos esa sala');
  });
});
