import { describe, expect, it } from 'vitest';
import { FILL_TOLERANCE, floodFill, parseHexColor, type Rgb } from './floodFill';

const RED: Rgb = [230, 57, 70];

/** Imagen RGBA opaca de un solo color. */
function image(width: number, height: number, gray = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

type Img = ReturnType<typeof image>;

const at = (img: Img, x: number, y: number): [number, number, number] => {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
};
const isColor = (img: Img, x: number, y: number, c: Rgb) =>
  at(img, x, y).every((v, k) => v === c[k]);

function setGray(img: Img, x: number, y: number, gray: number) {
  const i = (y * img.width + x) * 4;
  img.data[i] = gray;
  img.data[i + 1] = gray;
  img.data[i + 2] = gray;
}

/** Marco cuadrado (contorno) de `thickness` px con las esquinas (x0, y0) y (x1, y1) incluidas. */
function frame(
  img: Img,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  gray = 0,
) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const border =
        x - x0 < thickness || x1 - x < thickness || y - y0 < thickness || y1 - y < thickness;
      if (border) setGray(img, x, y, gray);
    }
  }
}

const fill = (img: Img, x: number, y: number, color: Rgb = RED, tolerance = FILL_TOLERANCE) =>
  floodFill(img.data, img.width, img.height, x, y, color, tolerance);

describe('floodFill', () => {
  it('rellena una región cerrada y no toca lo de afuera ni el contorno', () => {
    const img = image(40, 40);
    frame(img, 10, 10, 29, 29, 3);
    const painted = fill(img, 20, 20);
    // Interior: 20 - 2*3 = 14 de lado.
    expect(painted).toBe(14 * 14);
    expect(isColor(img, 20, 20, RED)).toBe(true);
    expect(isColor(img, 13, 13, RED)).toBe(true);
    expect(at(img, 11, 20)).toEqual([0, 0, 0]);
    expect(at(img, 5, 5)).toEqual([255, 255, 255]);
    expect(at(img, 35, 20)).toEqual([255, 255, 255]);
  });

  it('no atraviesa una línea fina cerrada (1 px) aunque quede pegada al relleno', () => {
    const img = image(30, 30);
    frame(img, 5, 5, 24, 24, 1);
    fill(img, 15, 15);
    expect(isColor(img, 6, 6, RED)).toBe(true);
    expect(at(img, 5, 15)).toEqual([0, 0, 0]);
    expect(at(img, 2, 2)).toEqual([255, 255, 255]);
    expect(at(img, 28, 15)).toEqual([255, 255, 255]);
  });

  it('una línea con un hueco deja pasar el relleno (control de la prueba anterior)', () => {
    const img = image(30, 30);
    frame(img, 5, 5, 24, 24, 2);
    setGray(img, 5, 15, 255);
    setGray(img, 6, 15, 255);
    fill(img, 15, 15);
    expect(isColor(img, 2, 2, RED)).toBe(true);
  });

  it('absorbe el borde suavizado: sin halo claro junto a la línea', () => {
    const img = image(40, 20);
    // Una línea vertical negra de 4 px (x 18..21) con borde suavizado a cada lado.
    for (let y = 0; y < 20; y += 1) {
      for (let x = 18; x <= 21; x += 1) setGray(img, x, y, 0);
      setGray(img, 17, y, 247); // cobertura ~3 %
      setGray(img, 22, y, 247);
    }
    fill(img, 5, 10);
    // El píxel suavizado casi blanco cae dentro de la tolerancia y se pinta con la región.
    expect(isColor(img, 17, 10, RED)).toBe(true);
    expect(isColor(img, 16, 10, RED)).toBe(true);
    // La línea y el lado opuesto quedan intactos.
    expect(at(img, 18, 10)).toEqual([0, 0, 0]);
    expect(at(img, 22, 10)).toEqual([247, 247, 247]);
    expect(at(img, 30, 10)).toEqual([255, 255, 255]);
  });

  it('un borde suavizado más oscuro que la tolerancia se conserva (pertenece a la línea)', () => {
    const img = image(30, 10);
    for (let y = 0; y < 10; y += 1) {
      setGray(img, 14, y, 128); // cobertura ~50 %
      setGray(img, 15, y, 0);
      setGray(img, 16, y, 128);
    }
    fill(img, 3, 5);
    expect(isColor(img, 13, 5, RED)).toBe(true);
    expect(at(img, 14, 5)).toEqual([128, 128, 128]);
    expect(at(img, 17, 5)).toEqual([255, 255, 255]);
  });

  it('el borde suavizado no abre paso: un trazo de color claro sigue conteniendo el relleno', () => {
    const img = image(30, 30);
    // Contorno amarillo (el color claro más cercano al blanco de la paleta) de 3 px.
    const yellow: Rgb = [252, 191, 73];
    for (let y = 8; y <= 21; y += 1) {
      for (let x = 8; x <= 21; x += 1) {
        const border = x < 11 || x > 18 || y < 11 || y > 18;
        if (border) {
          const i = (y * 30 + x) * 4;
          img.data[i] = yellow[0];
          img.data[i + 1] = yellow[1];
          img.data[i + 2] = yellow[2];
        }
      }
    }
    fill(img, 15, 15);
    expect(isColor(img, 12, 12, RED)).toBe(true);
    expect(at(img, 9, 15)).toEqual(yellow);
    expect(at(img, 3, 3)).toEqual([255, 255, 255]);
  });

  it('no hace nada si el punto ya tiene (casi) el color de relleno', () => {
    const img = image(10, 10, 255);
    expect(fill(img, 5, 5, [255, 255, 255])).toBe(0);
    expect(fill(img, 5, 5, [250, 250, 250])).toBe(0);
    expect(at(img, 0, 0)).toEqual([255, 255, 255]);

    const red = image(10, 10);
    fill(red, 5, 5);
    const before = red.data.slice();
    expect(fill(red, 2, 2)).toBe(0);
    expect(red.data).toEqual(before);
  });

  it('en los bordes del lienzo no se sale del arreglo ni se rompe', () => {
    const img = image(12, 8);
    frame(img, 0, 0, 11, 7, 1);
    // Desde una esquina (sobre el contorno negro): pinta solo el contorno, que es de un color.
    expect(fill(img, 0, 0)).toBe(12 * 8 - 10 * 6);
    expect(isColor(img, 11, 7, RED)).toBe(true);
    expect(at(img, 5, 4)).toEqual([255, 255, 255]);
    // Fuera de rango: nada.
    expect(fill(img, -1, 3)).toBe(0);
    expect(fill(img, 3, 8)).toBe(0);
    expect(fill(img, 12, 3)).toBe(0);
  });

  it('rellena hasta el último píxel de cada borde (columna y fila extremas)', () => {
    const img = image(9, 9);
    fill(img, 4, 4);
    for (const [x, y] of [
      [0, 0],
      [8, 0],
      [0, 8],
      [8, 8],
      [8, 4],
      [4, 8],
    ] as const) {
      expect(isColor(img, x, y, RED)).toBe(true);
    }
  });

  it('un lienzo vacío se llena entero, con laberinto de rayas incluido', () => {
    const img = image(64, 48);
    expect(fill(img, 10, 10)).toBe(64 * 48);

    // Serpentina: paredes alternadas que obligan a recorrerlo todo con muchos tramos.
    const maze = image(41, 41);
    for (let y = 1; y < 41; y += 2) {
      for (let x = 0; x < 41; x += 1) setGray(maze, x, y, 0);
      const gap = Math.floor(y / 2) % 2 === 0 ? 0 : 40;
      setGray(maze, gap, y, 255);
    }
    const walls = 20 * 41 - 20; // 20 paredes de 41 px, cada una con un hueco
    expect(fill(maze, 0, 0)).toBe(41 * 41 - walls);
    expect(isColor(maze, 40, 40, RED)).toBe(true);
  });

  it('ignora el alfa de entrada y deja el resultado opaco', () => {
    const img = image(4, 4);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    fill(img, 1, 1);
    expect(img.data[3]).toBe(255);
  });

  it('parseHexColor entiende los colores de la paleta', () => {
    expect(parseHexColor('#e63946')).toEqual([230, 57, 70]);
    expect(parseHexColor('#FFFFFF')).toEqual([255, 255, 255]);
    expect(parseHexColor('rojo')).toBeNull();
    expect(parseHexColor('#fff')).toBeNull();
  });

  it('llena el búfer completo de 1600 x 1200 en pocas decenas de milisegundos', () => {
    const img = image(1600, 1200);
    const start = performance.now();
    const painted = fill(img, 800, 600);
    const elapsed = performance.now() - start;
    expect(painted).toBe(1600 * 1200);
    // Se mide en la salida de la prueba; el tope es holgado para no fallar en máquinas lentas.
    console.log(`relleno de 1600x1200 vacío: ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(500);
  });

  it('con muchas líneas (peor caso para los tramos) sigue siendo rápido', () => {
    const img = image(1600, 1200);
    // Rejilla de líneas de 1 px cada 40 px, con un hueco en cada tramo para conectar todas las celdas.
    for (let y = 0; y < 1200; y += 40) for (let x = 0; x < 1600; x += 1) setGray(img, x, y, 0);
    for (let x = 0; x < 1600; x += 40) for (let y = 0; y < 1200; y += 1) setGray(img, x, y, 0);
    for (let y = 20; y < 1200; y += 40) for (let x = 0; x < 1600; x += 40) setGray(img, x, y, 255);
    for (let x = 20; x < 1600; x += 40) for (let y = 0; y < 1200; y += 40) setGray(img, x, y, 255);
    const start = performance.now();
    const painted = fill(img, 20, 20);
    const elapsed = performance.now() - start;
    console.log(`relleno de 1600x1200 con rejilla: ${elapsed.toFixed(1)} ms (${painted} px)`);
    expect(painted).toBeGreaterThan(1600 * 1200 * 0.9);
    expect(elapsed).toBeLessThan(500);
  });
});
