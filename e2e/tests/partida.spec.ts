// Escenario principal: una partida completa de tres jugadores (uno en teléfono), de la sala de
// espera al podio y de vuelta a la sala de espera. Una ronda, así que cada uno dibuja una vez.
//
// Puntajes esperados (PLAN.md sección 2): adivinadores 10, 8, 6...; dibujante 10 por el primer
// acierto y +1 por cada uno adicional.
//   Turno 1 (dibuja Ana):  Beto 10, Cami 8  -> Ana 11
//   Turno 2 (dibuja Beto): Ana 10, Cami 8   -> Beto 11
//   Turno 3 (dibuja Cami): Ana 10, Beto 8   -> Cami 11
//   Total: Ana 31, Beto 29, Cami 27

import { expect, openLobby, startGame, test, WORDS, type Player } from '../support/game';

/** Los puntos de un jugador en el panel de fin de turno, p. ej. "+11". */
async function expectGain(viewer: Player, name: string, gain: number): Promise<void> {
  const row = viewer.turnEnd
    .getByRole('list', { name: 'Puntos de este turno' })
    .getByRole('listitem')
    .filter({ hasText: name });
  await expect(row).toContainText(`+${gain}`);
}

/** Panel de fin de turno en todos los jugadores a la vez (la pausa dura pocos segundos). */
async function expectTurnEnd(
  viewers: Player[],
  word: string,
  gains: Record<string, number>,
  reason?: string,
): Promise<void> {
  await Promise.all(
    viewers.map(async (p) => {
      await p.expectPhase('TURN_END');
      await expect(p.turnEnd.getByRole('img', { name: word })).toBeVisible();
      if (reason) await expect(p.turnEnd).toContainText(reason);
      for (const [name, gain] of Object.entries(gains)) await expectGain(p, name, gain);
    }),
  );
}

test('partida completa de tres jugadores con podio y jugar de nuevo', async ({ newPlayer }) => {
  const ana = await newPlayer('Ana');
  const beto = await newPlayer('Beto', { phone: true });
  const cami = await newPlayer('Cami');
  const all = [ana, beto, cami];
  const [word1, word2, word3] = WORDS;

  // --- Sala de espera: B y C entran por el enlace y el anfitrión ajusta una ronda ---
  const code = await openLobby(all);
  const minusRounds = ana.page.getByRole('button', { name: 'Menos: Rondas' });
  await minusRounds.click();
  await minusRounds.click();
  for (const p of all) {
    await expect(p.page.getByRole('group', { name: 'Rondas' })).toContainText('1 ronda');
  }
  await expect(beto.page.getByTestId('waiting-for-host')).toContainText('Ana');

  // --- Turno 1: dibuja Ana ---
  await startGame(ana);
  await expect(ana.page.getByTestId('choosing-drawer')).toBeVisible();
  for (const option of word1)
    await expect(ana.page.getByTestId('choosing-drawer')).toContainText(option);
  for (const p of [beto, cami]) {
    await expect(p.page.getByTestId('choosing-guesser')).toContainText('Ana está eligiendo');
  }
  await ana.chooseWord(0); // huemul
  for (const p of all) await p.expectPhase('DRAWING');

  // El dibujante ve la palabra; los demás, solo la máscara; el lienzo parte vacío.
  await expect(
    ana.page.getByTestId('game-header').getByRole('img', { name: 'huemul' }),
  ).toBeVisible();
  for (const p of [beto, cami]) {
    await expect(p.page.getByTestId('game-header').getByRole('img')).toHaveAccessibleName(
      /Palabra de 6 letras/,
    );
    await expect(p.page.locator('body')).not.toContainText(/huemul/i);
  }
  for (const p of all) expect(await p.ink()).toBe(0);

  // Ana dibuja con el mouse: el lienzo de los demás deja de estar vacío.
  await ana.scribble();
  expect(await ana.ink()).toBeGreaterThan(0);
  for (const p of [beto, cami]) await expect.poll(() => p.ink()).toBeGreaterThan(0);
  await expect.poll(() => cami.clockSeconds()).toBeGreaterThan(30);

  // Cami escribe un intento errado y todos lo ven.
  await cami.say('perro');
  for (const p of [ana, beto]) {
    await expect(p.feed.getByRole('listitem').filter({ hasText: 'perro' })).toContainText('Cami');
  }
  await expect(cami.feed.getByRole('listitem').filter({ hasText: 'perro' })).toContainText('Tú');

  // "huemu" está a una letra: solo Cami recibe el aviso de "casi".
  await cami.say('huemu');
  await expect(cami.feed).toContainText('¡Casi!');

  // Beto acierta: se anuncia sin mostrar la palabra y el reloj se acorta a 20 s.
  await beto.say('huemul');
  await expect(beto.feed).toContainText('¡Adivinaste!');
  for (const p of [ana, cami]) await expect(p.feed).toContainText('Beto adivinó');
  for (const p of all) {
    await expect.poll(() => p.clockSeconds()).toBeLessThanOrEqual(21);
  }
  for (const p of [ana, beto]) {
    await expect(p.feed).not.toContainText('¡Casi!');
    await expect(p.feed).not.toContainText('huemu');
  }
  await expect(cami.page.locator('body')).not.toContainText(/huemul/i);

  // Cami acierta escribiendo con otra mayúscula y tilde; con eso acertaron todos.
  await cami.say('Huemúl');
  await expect(cami.feed).toContainText('¡Adivinaste!');
  await expect(ana.feed).toContainText('Cami adivinó');
  await expect(ana.feed).not.toContainText(/huemul/i);

  // Fin del turno: la palabra y los puntos de cada uno.
  await expectTurnEnd(all, 'huemul', { Ana: 11, Beto: 10, Cami: 8 }, '¡Todos adivinaron!');

  // --- Turno 2: dibuja Beto (el teléfono, con toques) y el lienzo parte vacío ---
  for (const p of all) await p.expectPhase('CHOOSING');
  await expect(beto.page.getByTestId('choosing-drawer')).toBeVisible();
  for (const option of word2)
    await expect(beto.page.getByTestId('choosing-drawer')).toContainText(option);
  for (const p of [ana, cami]) {
    await expect(p.page.getByTestId('choosing-guesser')).toContainText('Beto está eligiendo');
  }
  await beto.chooseWord(0); // copihue
  for (const p of all) await p.expectPhase('DRAWING');
  for (const p of all) expect(await p.ink()).toBe(0);
  await ana.expectScore('Ana', 11);
  await ana.expectScore('Beto', 10);
  await ana.expectScore('Cami', 8);

  await beto.scribble();
  expect(await beto.ink()).toBeGreaterThan(0);
  for (const p of [ana, cami]) await expect.poll(() => p.ink()).toBeGreaterThan(0);

  await ana.say('copihue');
  await expect(cami.feed).toContainText('Ana adivinó');
  await cami.say('copihue');
  await expectTurnEnd(all, 'copihue', { Beto: 11, Ana: 10, Cami: 8 });

  // --- Turno 3: dibuja Cami ---
  for (const p of all) await p.expectPhase('CHOOSING');
  await expect(cami.page.getByTestId('choosing-drawer')).toBeVisible();
  for (const option of word3)
    await expect(cami.page.getByTestId('choosing-drawer')).toContainText(option);
  await cami.chooseWord(0); // guata
  for (const p of all) await p.expectPhase('DRAWING');
  for (const p of all) expect(await p.ink()).toBe(0);
  await cami.scribble();
  for (const p of [ana, beto]) await expect.poll(() => p.ink()).toBeGreaterThan(0);

  await ana.say('guata');
  await expect(beto.feed).toContainText('Ana adivinó');
  await beto.say('guata');
  await expectTurnEnd(all, 'guata', { Cami: 11, Ana: 10, Beto: 8 });

  // --- Fin de partida: podio con los puntajes sumados ---
  for (const p of all) {
    await expect(p.page.getByRole('heading', { name: '¡Terminó la partida!' })).toBeVisible();
    await expect(p.page.getByTestId('winner-line')).toHaveText('¡Ganó Ana!');
    await expect(p.page.getByTestId('podium-1')).toContainText('Ana');
    await expect(p.page.getByTestId('podium-1')).toContainText('31 pts');
    await expect(p.page.getByTestId('podium-2')).toContainText('Beto');
    await expect(p.page.getByTestId('podium-2')).toContainText('29 pts');
    await expect(p.page.getByTestId('podium-3')).toContainText('Cami');
    await expect(p.page.getByTestId('podium-3')).toContainText('27 pts');
  }
  await expect(ana.page.getByText('Quedaste en el lugar 1 con 31 puntos.')).toBeVisible();
  await expect(beto.page.getByText('Quedaste en el lugar 2 con 29 puntos.')).toBeVisible();
  await expect(cami.page.getByText('Quedaste en el lugar 3 con 27 puntos.')).toBeVisible();
  for (const p of [beto, cami]) {
    await expect(p.page.getByTestId('waiting-for-host')).toContainText('Ana');
  }

  // --- Jugar de nuevo: todos vuelven a la sala de espera de la misma sala ---
  await ana.page.getByTestId('play-again').click();
  for (const p of all) {
    await expect(p.page.getByTestId('room-code')).toHaveText(code);
    for (const other of all) {
      await expect(p.page.getByTestId('lobby-players')).toContainText(other.name);
    }
  }
  await expect(ana.page.getByTestId('start-button')).toBeEnabled();
  await expect(beto.page.getByTestId('waiting-for-host')).toBeVisible();
});
