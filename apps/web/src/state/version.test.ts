import { describe, expect, it } from 'vitest';
import {
  loadReloadedVersion,
  saveReloadedVersion,
  savePendingHomeError,
  takePendingHomeError,
  type KeyValueStorage,
} from './identity';
import {
  VISIBLE_RECHECK_MS,
  decideUpdate,
  extractEntryScript,
  isOutdated,
  shouldCheckOnVisible,
} from './version';

const BUILT = `<!doctype html>
<html lang="es-CL">
  <head>
    <meta charset="UTF-8" />
    <title>Dibuja y Adivina</title>
    <script type="module" crossorigin src="/assets/index-D6VYQv_b.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-uq0IQzGi.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe('extractEntryScript', () => {
  it('lee el script principal del HTML compilado', () => {
    expect(extractEntryScript(BUILT)).toBe('/assets/index-D6VYQv_b.js');
  });

  it('acepta los atributos en otro orden, con comillas simples o sin comillas', () => {
    expect(
      extractEntryScript('<script src="/assets/a-1.js" crossorigin type="module"></script>'),
    ).toBe('/assets/a-1.js');
    expect(extractEntryScript("<script src='/assets/b-2.js' type='module'></script>")).toBe(
      '/assets/b-2.js',
    );
    expect(extractEntryScript('<SCRIPT TYPE=module SRC=/assets/c-3.js></SCRIPT>')).toBe(
      '/assets/c-3.js',
    );
  });

  it('con varios scripts toma el primer módulo con src, no uno clásico ni uno en línea', () => {
    const html = `
      <script src="/analytics.js"></script>
      <script type="module">console.log(1)</script>
      <script type="module" src="/assets/index-AAA.js"></script>
      <script type="module" src="/assets/otro-BBB.js"></script>`;
    expect(extractEntryScript(html)).toBe('/assets/index-AAA.js');
  });

  it('ignora la query, el fragmento y los scripts comentados', () => {
    const html = `
      <!-- <script type="module" src="/assets/viejo-ZZZ.js"></script> -->
      <script type="module" src="/assets/index-AAA.js?v=2#x"></script>`;
    expect(extractEntryScript(html)).toBe('/assets/index-AAA.js');
  });

  it('sin script devuelve null', () => {
    expect(extractEntryScript('<html><body>mantenimiento</body></html>')).toBeNull();
    expect(extractEntryScript('')).toBeNull();
    expect(extractEntryScript('<script type="module"></script>')).toBeNull();
  });

  it('el HTML de desarrollo de Vite no tiene versión', () => {
    const dev = `<!doctype html><html><head>
      <script type="module" src="/@vite/client"></script>
      <script type="module" src="/src/main.tsx"></script>
    </head><body><div id="root"></div></body></html>`;
    expect(extractEntryScript(dev)).toBeNull();
  });
});

describe('isOutdated', () => {
  it('solo es antigua si las dos versiones se conocen y difieren', () => {
    expect(isOutdated('/assets/a.js', '/assets/b.js')).toBe(true);
    expect(isOutdated('/assets/a.js', '/assets/a.js')).toBe(false);
    expect(isOutdated(null, '/assets/b.js')).toBe(false);
    expect(isOutdated('/assets/a.js', null)).toBe(false);
  });
});

describe('decideUpdate', () => {
  const base = {
    running: '/assets/a.js',
    published: '/assets/b.js',
    inRoom: false,
    reloadedFor: null,
  };

  it('en el inicio con versión nueva recarga', () => {
    expect(decideUpdate(base)).toBe('reload');
  });

  it('dentro de una sala solo avisa, aunque ya se haya recargado por esa versión', () => {
    expect(decideUpdate({ ...base, inRoom: true })).toBe('notify');
    expect(decideUpdate({ ...base, inRoom: true, reloadedFor: '/assets/b.js' })).toBe('notify');
  });

  it('no recarga de nuevo por la misma versión (protege contra bucles)', () => {
    expect(decideUpdate({ ...base, reloadedFor: '/assets/b.js' })).toBe('none');
  });

  it('si se publica otra versión distinta a la ya recargada, vuelve a recargar', () => {
    expect(decideUpdate({ ...base, reloadedFor: '/assets/c.js' })).toBe('reload');
  });

  it('sin diferencia o sin datos no hace nada', () => {
    expect(decideUpdate({ ...base, published: '/assets/a.js' })).toBe('none');
    expect(decideUpdate({ ...base, published: null })).toBe('none');
    expect(decideUpdate({ ...base, running: null })).toBe('none');
    expect(decideUpdate({ ...base, running: null, inRoom: true })).toBe('none');
  });
});

describe('shouldCheckOnVisible', () => {
  it('comprueba si nunca se comprobó o pasaron más de 5 minutos', () => {
    expect(shouldCheckOnVisible(1_000, null)).toBe(true);
    expect(shouldCheckOnVisible(10_000 + VISIBLE_RECHECK_MS + 1, 10_000)).toBe(true);
  });

  it('no comprueba si la última fue hace 5 minutos o menos', () => {
    expect(shouldCheckOnVisible(10_000 + VISIBLE_RECHECK_MS, 10_000)).toBe(false);
    expect(shouldCheckOnVisible(10_500, 10_000)).toBe(false);
  });
});

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('memoria entre recargas', () => {
  it('recuerda la versión por la que ya se recargó', () => {
    const storage = memoryStorage();
    expect(loadReloadedVersion(storage)).toBeNull();
    saveReloadedVersion(storage, '/assets/b.js');
    expect(loadReloadedVersion(storage)).toBe('/assets/b.js');
  });

  it('el error del inicio se lee una sola vez y solo si es un código conocido', () => {
    const storage = memoryStorage();
    expect(takePendingHomeError(storage)).toBeNull();
    savePendingHomeError(storage, 'room_not_found');
    expect(takePendingHomeError(storage)).toBe('room_not_found');
    expect(takePendingHomeError(storage)).toBeNull();
    storage.setItem('dya.pendingHomeError', 'no_existe');
    expect(takePendingHomeError(storage)).toBeNull();
    expect(storage.getItem('dya.pendingHomeError')).toBeNull();
  });

  it('sin almacenamiento no falla', () => {
    expect(loadReloadedVersion(null)).toBeNull();
    saveReloadedVersion(null, '/assets/b.js');
    savePendingHomeError(null, 'internal');
    expect(takePendingHomeError(null)).toBeNull();
  });
});
