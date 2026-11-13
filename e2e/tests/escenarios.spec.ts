// Escenarios sueltos, cada uno con su propia sala. Palabras fijas del servidor de pruebas: el primer
// turno ofrece huemul / cueca / micro y se elige siempre la primera.

import { expect, openInvite, openLobby, startDrawing, startGame, test } from '../support/game';

test.describe('palabra secreta', () => {
  test('no aparece en el DOM ni en el tráfico de un adivinador durante el turno', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const beto = await newPlayer('Beto');
    const cami = await newPlayer('Cami');
    await openLobby([ana, beto, cami]);
    await startGame(ana);

    // Elegir palabra: el dibujante ve las opciones; los demás, solo a quién esperan.
    await expect(ana.page.getByTestId('choosing-drawer')).toContainText('huemul');
    for (const p of [beto, cami]) {
      await expect(p.page.getByTestId('choosing-guesser')).toBeVisible();
      await expect(p.page.locator('body')).not.toContainText(/huemul/i);
      expect(await p.page.content()).not.toMatch(/huemul/i);
    }

    await ana.chooseWord(0);
    for (const p of [ana, beto, cami]) await p.expectPhase('DRAWING');
    await ana.scribble();
    for (const p of [beto, cami]) await expect.poll(() => p.ink()).toBeGreaterThan(0);

    // El dibujante sí la ve (control: la comprobación mira la palabra correcta).
    await expect(ana.page.locator('body')).toContainText(/huemul/i);

    // Con trazos, intentos errados y hasta una pista de por medio, los adivinadores no la reciben.
    await cami.say('perro');
    await expect(beto.feed).toContainText('perro');
    for (const p of [beto, cami]) {
      await expect(p.page.locator('body')).not.toContainText(/huemul/i);
      expect(await p.page.content()).not.toMatch(/huemul/i);
      // Y tampoco en nada de lo que el servidor les envió (sockets y sondeo).
      expect(p.receivedText()).toContain('turn:start');
      expect(p.receivedText()).not.toContain('huemul');
    }

    // Control positivo: al terminar el turno la palabra sí se revela a todos.
    await beto.say('huemul');
    await cami.say('huemul');
    for (const p of [ana, beto, cami]) await p.expectPhase('TURN_END');
    await expect(cami.page.locator('body')).toContainText(/huemul/i);
    expect(cami.receivedText()).toContain('huemul');
  });
});

test.describe('reconexión', () => {
  test('recargar a un adivinador a mitad de turno conserva puntaje y dibujo', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const beto = await newPlayer('Beto');
    const cami = await newPlayer('Cami');
    await startDrawing([ana, beto, cami]);

    // Turno 1: Beto 10, Cami 8, Ana 11.
    await ana.scribble();
    await beto.say('huemul');
    await expect(cami.feed).toContainText('Beto adivinó');
    await cami.say('huemul');
    for (const p of [ana, beto, cami]) await p.expectPhase('TURN_END');

    // Turno 2: dibuja Beto.
    for (const p of [ana, beto, cami]) await p.expectPhase('CHOOSING');
    await beto.chooseWord(0); // copihue
    for (const p of [ana, beto, cami]) await p.expectPhase('DRAWING');
    await beto.scribble();
    await expect.poll(() => cami.ink()).toBeGreaterThan(0);
    await cami.expectScore('Cami', 8);
    const inkBefore = await cami.ink();

    // Cami recarga la página en pleno turno.
    const url = cami.page.url();
    await cami.page.reload();
    await expect(cami.page).toHaveURL(url);
    await cami.expectPhase('DRAWING');

    // Conserva el puntaje (el suyo y el de los demás) y el dibujo, y sigue siendo la misma persona.
    await cami.expectScore('Cami', 8);
    await cami.expectScore('Ana', 11);
    await cami.expectScore('Beto', 10);
    await expect(cami.page.getByTestId('player-column').getByRole('listitem')).toHaveCount(3);
    await expect.poll(() => cami.ink()).toBeGreaterThan(inkBefore * 0.7);
    expect(await cami.ink()).toBeLessThan(inkBefore * 1.3);
    await expect(cami.page.getByTestId('game-header').getByRole('img')).toHaveAccessibleName(
      /Palabra de 7 letras/,
    );
    await expect(cami.page.locator('body')).not.toContainText(/copihue/i);

    // Y el turno sigue: recibe los trazos nuevos y puede adivinar.
    await beto.scribble(1);
    await expect.poll(() => cami.ink()).toBeGreaterThan(inkBefore * 1.3);
    await cami.say('copihue');
    await expect(cami.feed).toContainText('¡Adivinaste!');
    await expect(ana.feed).toContainText('Cami adivinó');
  });

  test('si el dibujante cierra su pestaña, el turno termina para los demás sin puntos', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const beto = await newPlayer('Beto');
    const cami = await newPlayer('Cami');
    await startDrawing([ana, beto, cami]);
    await ana.scribble();
    for (const p of [beto, cami]) await expect.poll(() => p.ink()).toBeGreaterThan(0);

    await ana.page.close();

    for (const p of [beto, cami]) {
      await p.expectPhase('TURN_END');
      await expect(p.turnEnd).toContainText('Quien dibujaba se desconectó');
      await expect(p.turnEnd).toContainText('Nadie sumó puntos esta vez.');
      await expect(p.turnEnd.getByRole('img', { name: 'huemul' })).toBeVisible();
    }

    // La partida sigue con quien sigue en el orden: Beto.
    await beto.expectPhase('CHOOSING');
    await expect(beto.page.getByTestId('choosing-drawer')).toBeVisible();
    await expect(cami.page.getByTestId('choosing-guesser')).toContainText('Beto está eligiendo');
  });

  test('un cuarto jugador que entra tarde ve el dibujo en curso y puede adivinar', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const beto = await newPlayer('Beto');
    const cami = await newPlayer('Cami');
    const dani = await newPlayer('Dani');
    const code = await startDrawing([ana, beto, cami]);
    await ana.scribble();
    for (const p of [beto, cami]) await expect.poll(() => p.ink()).toBeGreaterThan(0);

    // Dani entra por el enlace con el turno en marcha.
    await openInvite(dani, code);
    await dani.expectPhase('DRAWING');
    await expect.poll(() => dani.ink()).toBeGreaterThan(0);
    await expect(dani.page.getByTestId('game-header').getByRole('img')).toHaveAccessibleName(
      /Palabra de 6 letras/,
    );
    await expect(dani.page.locator('body')).not.toContainText(/huemul/i);
    for (const p of [ana, beto, cami]) {
      await expect(p.feed).toContainText('Dani entró a la sala');
      await expect(p.playerRow('Dani')).toBeVisible();
    }

    // Dani adivina de inmediato; luego Beto y Cami.
    await dani.say('huemul');
    await expect(dani.feed).toContainText('¡Adivinaste!');
    await expect(beto.feed).toContainText('Dani adivinó');
    await beto.say('huemul');
    await expect(cami.feed).toContainText('Beto adivinó');
    await cami.say('huemul');
    for (const p of [ana, beto, cami, dani]) await p.expectPhase('TURN_END');

    // Dani suma como adivinador (primero: 10); el dibujante no cuenta su acierto, que entró después.
    for (const p of [ana, dani]) {
      await expect(p.turnEnd).toContainText('¡Todos adivinaron!');
      const rows = p.turnEnd
        .getByRole('list', { name: 'Puntos de este turno' })
        .getByRole('listitem');
      await expect(rows.filter({ hasText: 'Dani' })).toContainText('+10');
      await expect(rows.filter({ hasText: 'Beto' })).toContainText('+8');
      await expect(rows.filter({ hasText: 'Cami' })).toContainText('+6');
      await expect(rows.filter({ hasText: 'Ana' })).toContainText('+11');
    }
  });
});

test.describe('dibujo táctil', () => {
  test('lo que se dibuja con toques en el teléfono se replica en los demás', async ({
    newPlayer,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'los toques reales se inyectan con el protocolo de Chromium',
    );
    const beto = await newPlayer('Beto', { phone: true });
    const ana = await newPlayer('Ana');
    const cami = await newPlayer('Cami');
    // El teléfono es el anfitrión, así que dibuja primero.
    await startDrawing([beto, ana, cami]);

    // Sin desbordes: el juego entra en la pantalla del teléfono.
    const overflow = await beto.page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await beto.page.evaluate(() => {
      const w = window as unknown as { __pointerTypes: string[] };
      w.__pointerTypes = [];
      document.addEventListener('pointerdown', (e) => w.__pointerTypes.push(e.pointerType), true);
    });
    expect(await beto.ink()).toBe(0);
    await beto.scribble();

    const types = await beto.page.evaluate(
      () => (window as unknown as { __pointerTypes: string[] }).__pointerTypes,
    );
    expect(types).toContain('touch');
    expect(await beto.ink()).toBeGreaterThan(0);
    for (const p of [ana, cami]) await expect.poll(() => p.ink()).toBeGreaterThan(0);
  });
});

test.describe('intentos', () => {
  test('un intento casi correcto muestra "¡casi!" solo a quien lo escribió', async ({
    newPlayer,
  }) => {
    const ana = await newPlayer('Ana');
    const beto = await newPlayer('Beto');
    const cami = await newPlayer('Cami');
    await startDrawing([ana, beto, cami]);

    // A una letra de "huemul": el aviso y el texto son solo para Beto.
    await beto.say('huemu');
    await expect(beto.feed).toContainText('¡Casi! Estás muy cerca');
    await expect(beto.feed).toContainText('huemu');

    // A dos letras ya no es "casi": es un intento normal que ven todos.
    await beto.say('huem');
    for (const p of [ana, cami]) {
      await expect(p.feed.getByRole('listitem').filter({ hasText: 'huem' })).toContainText('Beto');
    }
    await expect(beto.feed.getByText('¡Casi!')).toHaveCount(1);

    // Un mensaje posterior de otra persona llega a los demás después de lo de Beto: si el aviso
    // o el texto "huemu" hubieran salido para ellos, ya estarían en pantalla.
    await cami.say('perro');
    await expect(ana.feed).toContainText('perro');
    await expect(beto.feed).toContainText('perro');
    for (const p of [ana, cami]) {
      await expect(p.feed).not.toContainText('¡Casi!');
      await expect(p.feed).not.toContainText('huemu');
      await expect(p.page.locator('body')).not.toContainText('Estás muy cerca');
    }
  });
});

test.describe('entrada por enlace', () => {
  test('el enlace a una sala inexistente muestra el error en el inicio', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana');
    await ana.page.goto('/sala/XXXX');
    await expect(ana.page.getByTestId('invite-banner')).toContainText('XXXX');
    await ana.page.getByLabel('¿Cómo te llamamos?').fill(ana.name);
    await ana.page.getByRole('button', { name: 'Entrar a la sala' }).click();

    await expect(ana.page.getByTestId('error-notice')).toContainText('No encontramos esa sala');
    // Sigue en el inicio (no entró a ninguna sala) y puede crear la suya.
    await expect(ana.page.getByTestId('home-form')).toBeVisible();
    await expect(ana.page.getByTestId('room-code')).toHaveCount(0);
    await ana.page.getByRole('button', { name: 'Mejor creo mi propia sala' }).click();
    await expect(ana.page.getByTestId('room-code')).toHaveText(/^[A-Z]{4}$/);
  });
});
