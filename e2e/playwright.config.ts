import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.DYA_E2E_PORT ?? 3199);
const ORIGIN = `http://127.0.0.1:${PORT}`;

// Un solo origen: el servidor de producción sirve el cliente compilado y los sockets
// (ver scripts/serve.mjs, que también fija tiempos cortos y palabras conocidas).
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: ORIGIN,
    locale: 'es-CL',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `${ORIGIN}/health`,
    // Incluye la compilación del cliente.
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { DYA_E2E_PORT: String(PORT) },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // WebKit solo corre el escenario principal.
    {
      name: 'webkit',
      testMatch: /partida\.spec\.ts/,
      // WebKit en Windows tarda bastante más por acción que Chromium.
      timeout: 240_000,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
