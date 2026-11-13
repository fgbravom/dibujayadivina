import { describe, expect, it } from 'vitest';
import {
  URGENT_SECONDS,
  clockLabel,
  computeServerOffset,
  formatClock,
  isUrgent,
  secondsRemaining,
} from './clock';

describe('formatClock', () => {
  it('formatea minutos y segundos con dos dígitos', () => {
    expect(formatClock(80)).toBe('1:20');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(180)).toBe('3:00');
    expect(formatClock(600)).toBe('10:00');
  });

  it('no baja de cero y descarta decimales', () => {
    expect(formatClock(-4)).toBe('0:00');
    expect(formatClock(59.9)).toBe('0:59');
  });
});

describe('clockLabel', () => {
  it('habla en singular y plural', () => {
    expect(clockLabel(1)).toBe('1 segundo');
    expect(clockLabel(10)).toBe('10 segundos');
    expect(clockLabel(60)).toBe('1 minuto');
    expect(clockLabel(80)).toBe('1 minuto 20 segundos');
    expect(clockLabel(121)).toBe('2 minutos 1 segundo');
    expect(clockLabel(0)).toBe('0 segundos');
  });
});

describe('secondsRemaining', () => {
  it('usa la hora del servidor estimada con el desfase', () => {
    // El servidor va 5 s adelantado respecto de este cliente.
    const offset = computeServerOffset(105_000, 100_000);
    expect(offset).toBe(5_000);
    // Hora local 100 s -> servidor 105 s; faltan 15 s para 120 s.
    expect(secondsRemaining(120_000, offset, 100_000)).toBe(15);
  });

  it('redondea hacia arriba para no mostrar 0 antes de tiempo', () => {
    expect(secondsRemaining(10_001, 0, 10_000)).toBe(1);
    expect(secondsRemaining(11_000, 0, 10_000)).toBe(1);
    expect(secondsRemaining(11_001, 0, 10_000)).toBe(2);
  });

  it('nunca es negativo', () => {
    expect(secondsRemaining(1_000, 0, 5_000)).toBe(0);
  });
});

describe('isUrgent', () => {
  it('es urgente en los últimos 10 segundos', () => {
    expect(isUrgent(URGENT_SECONDS)).toBe(true);
    expect(isUrgent(URGENT_SECONDS + 1)).toBe(false);
    expect(isUrgent(0)).toBe(true);
  });

  it('no es urgente sin reloj', () => {
    expect(isUrgent(null)).toBe(false);
  });
});
