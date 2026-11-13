// Rutas del juego. No hay router: solo `/` (inicio) y `/sala/CODIGO` (entrada por enlace).

import { ROOM_CODE_LENGTH } from '@dya/shared';

const ROOM_PATH = new RegExp(`^/sala/([A-Za-z]{${ROOM_CODE_LENGTH}})/?$`);

/** Código de sala (en mayúsculas) de una ruta `/sala/ABCD`, o `null` si no es una ruta de sala. */
export function parseRoomPath(pathname: string): string | null {
  const match = ROOM_PATH.exec(pathname);
  return match?.[1] ? match[1].toUpperCase() : null;
}
