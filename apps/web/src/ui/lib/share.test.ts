import { describe, expect, it, vi } from 'vitest';
import { roomShareUrl, shareLink, type ShareData } from './share';

const data: ShareData = { url: 'https://dya.cl/sala/ABCD', title: 'Dibuja y Adivina', text: 'Ven' };

function abortError(): Error {
  const e = new Error('cancelado');
  e.name = 'AbortError';
  return e;
}

describe('roomShareUrl', () => {
  it('arma el enlace de entrada por código', () => {
    expect(roomShareUrl('ABCD', 'https://dya.cl')).toBe('https://dya.cl/sala/ABCD');
    expect(roomShareUrl('ABCD', 'http://localhost:5173/')).toBe('http://localhost:5173/sala/ABCD');
  });
});

describe('shareLink', () => {
  it('usa el panel nativo si existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    expect(await shareLink(data, { share, writeText })).toBe('shared');
    expect(share).toHaveBeenCalledWith(data);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copia el enlace si no hay Web Share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(data, { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it('copia si canShare rechaza los datos', async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(data, { share, canShare: () => false, writeText })).toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('cerrar el panel no es un error ni copia', async () => {
    const share = vi.fn().mockRejectedValue(abortError());
    const writeText = vi.fn();
    expect(await shareLink(data, { share, writeText })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('si el panel falla de otra forma, copia', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(data, { share, writeText })).toBe('copied');
  });

  it('informa failed si no se puede ni compartir ni copiar', async () => {
    expect(await shareLink(data, {})).toBe('failed');
    const writeText = vi.fn().mockRejectedValue(new Error('denegado'));
    expect(await shareLink(data, { writeText })).toBe('failed');
  });
});
