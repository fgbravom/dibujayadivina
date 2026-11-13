// Levanta el entorno de las pruebas e2e en un solo proceso: compila el cliente (sin Vite en
// ejecución) y arranca el servidor de producción, que lo sirve junto con Socket.IO en un solo
// origen. Lo invoca `webServer` de playwright.config.ts; Playwright lo detiene al terminar.
//
// Los tiempos son cortos pero suficientes para que una prueba actúe dentro de un turno, y las
// palabras son fijas (ver `WORDS`). Variables: DYA_E2E_PORT, DYA_E2E_SKIP_BUILD=1 (reutiliza la
// compilación anterior).

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const webDir = path.join(root, 'e2e', 'build', 'web');
const port = process.env.DYA_E2E_PORT ?? '3199';

if (process.env.DYA_E2E_SKIP_BUILD !== '1') {
  // Compila fuera de apps/web/dist para no pisar la salida de otros trabajos en paralelo.
  const viteBin = path.join(root, 'apps', 'web', 'node_modules', 'vite', 'bin', 'vite.js');
  const build = spawnSync(
    process.execPath,
    [viteBin, 'build', '--outDir', webDir, '--emptyOutDir'],
    { cwd: path.join(root, 'apps', 'web'), stdio: 'inherit' },
  );
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: path.join(root, 'apps', 'server'),
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: port,
    WEB_DIR: webDir,
    DYA_TEST: '1',
    // Elegir palabra: de sobra para que la prueba la escoja.
    DYA_CHOOSE_MS: '15000',
    // Dibujar: más de 20 s para que se note el acortamiento tras el primer acierto.
    DYA_DRAW_MS: '60000',
    DYA_TURN_END_MS: '5000',
    DYA_GRACE_MS: '15000',
    // Turnos 1, 2 y 3 ofrecen: huemul/cueca/micro, copihue/sopaipilla/volantin, guata/polera/completo.
    DYA_WORDS: 'huemul,cueca,micro,copihue,sopaipilla,volantin,guata,polera,completo',
    // Todas las pruebas conectan desde 127.0.0.1 y crean muchas salas.
    DYA_MAX_CONNECTIONS_PER_IP: '1000',
    DYA_MAX_ROOMS_PER_IP_PER_MINUTE: '10000',
  },
});

server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, () => {
    server.kill();
    process.exit(0);
  });
}
