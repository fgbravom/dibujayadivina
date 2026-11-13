// Bote de pintura: el dibujante rellena una figura cerrada y los demás ven el mismo relleno, incluso
// quien recarga. Solo Chromium (los toques del teléfono se inyectan con su protocolo).

import { expect, startDrawing, test, type Player } from '../support/game';

const RED = [230, 57, 70] as const;
const NAVY = [29, 53, 87] as const;
/** Rectángulo (fracciones del lienzo) un poco más grande que la figura, para separar dentro de fuera. */
const AROUND = [0.28, 0.28, 0.72, 0.72] as const;
/** Interior de la figura, sin el grosor de su contorno. */
const INSIDE = [0.32, 0.32, 0.68, 0.68] as const;

/** Rojo dentro de la figura y nada de rojo fuera de ella. */
async function expectFilled(player: Player) {
  await expect
    .poll(async () => {
      const { inside, area } = await player.colorCounts(RED, INSIDE);
      return area > 0 ? inside / area : 0;
    })
    .toBeGreaterThan(0.95);
  const { outside } = await player.colorCounts(RED, AROUND);
  expect(outside).toBe(0);
}

async function expectNoRed(player: Player) {
  await expect.poll(async () => (await player.colorCounts(RED, AROUND)).inside).toBe(0);
  expect((await player.colorCounts(RED, AROUND)).outside).toBe(0);
}

test.describe('bote de pintura', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'solo Chromium');

  test('rellena una figura cerrada en todas las pantallas, se deshace y sobrevive a una recarga', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const beto = await newPlayer('Beto');
    const cami = await newPlayer('Cami');
    await startDrawing([ana, beto, cami]);

    // Una figura cerrada, de contorno negro.
    await ana.drawBox(0.3, 0.3, 0.7, 0.7);
    for (const p of [beto, cami]) await expect.poll(() => p.ink()).toBeGreaterThan(0);
    await expectNoRed(ana);

    // Se activa el bote (queda presionado), se elige rojo (el bote sigue activo) y se toca el centro.
    await ana.chooseTool('Bote de pintura');
    await expect(ana.page.getByRole('button', { name: 'Bote de pintura' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // El cursor indica el modo: balde con el bote, cruz con el pincel.
    await expect(ana.page.locator('canvas')).toHaveCSS('cursor', /^url\(/);
    await ana.chooseColor('rojo');
    await expect(ana.page.getByRole('button', { name: 'Bote de pintura' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await ana.tapCanvas(0.5, 0.5);

    for (const p of [ana, beto, cami]) await expectFilled(p);
    // El contorno negro sigue ahí.
    expect(await beto.ink()).toBeGreaterThan(0);

    // Deshacer quita el relleno en ambos y deja la figura.
    await ana.undo();
    for (const p of [ana, beto, cami]) await expectNoRed(p);
    for (const p of [ana, beto]) expect(await p.ink()).toBeGreaterThan(0);

    // Se vuelve a rellenar y se dibuja encima con el pincel: el orden importa en todos.
    await ana.tapCanvas(0.5, 0.5);
    for (const p of [ana, beto]) await expectFilled(p);
    await ana.chooseTool('Bote de pintura'); // vuelve al pincel
    await expect(ana.page.getByRole('button', { name: 'Bote de pintura' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(ana.page.locator('canvas')).toHaveCSS('cursor', 'crosshair');
    await ana.chooseColor('azul marino');
    await ana.drawBox(0.4, 0.4, 0.6, 0.6);
    await expect.poll(async () => (await beto.colorCounts(NAVY, AROUND)).inside).toBeGreaterThan(0);
    const betoNavy = (await beto.colorCounts(NAVY, AROUND)).inside;

    // Cami recarga a mitad del turno: recibe el historial con el relleno en su orden.
    const url = cami.page.url();
    await cami.page.reload();
    await expect(cami.page).toHaveURL(url);
    await cami.expectPhase('DRAWING');
    await expect
      .poll(async () => {
        const { inside, area } = await cami.colorCounts(RED, INSIDE);
        return inside / area;
      })
      .toBeGreaterThan(0.5);
    const after = await cami.colorCounts(RED, INSIDE);
    const reference = await beto.colorCounts(RED, INSIDE);
    expect(Math.abs(after.inside - reference.inside) / reference.area).toBeLessThan(0.01);
    expect((await cami.colorCounts(RED, AROUND)).outside).toBe(0);
    // El cuadro azul de después quedó encima del rojo, igual que en la pantalla de Beto.
    const navy = (await cami.colorCounts(NAVY, AROUND)).inside;
    expect(Math.abs(navy - betoNavy) / betoNavy).toBeLessThan(0.02);
  });

  test('en un teléfono de 360 px la barra sigue en una fila y un toque rellena', async ({
    newPlayer,
  }) => {
    const beto = await newPlayer('Beto', { phone: true });
    const ana = await newPlayer('Ana');
    const cami = await newPlayer('Cami');
    await startDrawing([beto, ana, cami]);
    await beto.page.setViewportSize({ width: 360, height: 640 });

    // Una sola fila, sin desborde: todos los botones a la misma altura y dentro de la pantalla.
    const toolbar = beto.page.getByTestId('canvas-toolbar');
    await expect(toolbar).toBeVisible();
    const boxes = await toolbar.getByRole('button').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, height: r.height, width: r.width };
      }),
    );
    expect(boxes).toHaveLength(6);
    for (const b of boxes) {
      expect(Math.abs(b.top - boxes[0]!.top)).toBeLessThanOrEqual(1);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(360);
    }
    const overflow = await beto.page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Con toques: figura cerrada, bote, color rojo y un toque en el centro.
    await beto.drawBox(0.3, 0.3, 0.7, 0.7);
    await beto.chooseTool('Bote de pintura');
    await beto.chooseColor('rojo');
    await beto.tapCanvas(0.5, 0.5);
    for (const p of [beto, ana, cami]) await expectFilled(p);
  });
});
