import { describe, expect, it } from 'vitest';
import {
  HALL_DEFAULT_SCHEDULE, HALL_MAX_ADVANCE_DAYS, HALL_MIN_ADVANCE_DAYS, formatClock, localIsoDate,
} from './hallSchedule';

describe('horario del salón (por día)', () => {
  it('por defecto la entrada es a las 3:00 p. m. y la salida a las 8:00 p. m.', () => {
    expect(HALL_DEFAULT_SCHEDULE).toEqual({ checkInTime: '15:00', checkOutTime: '20:00' });
    expect(formatClock(HALL_DEFAULT_SCHEDULE.checkInTime)).toBe('3:00 p. m.');
    expect(formatClock(HALL_DEFAULT_SCHEDULE.checkOutTime)).toBe('8:00 p. m.');
  });

  it.each([
    ['00:00', '12:00 a. m.'], ['09:05', '9:05 a. m.'], ['12:00', '12:00 p. m.'], ['13:30', '1:30 p. m.'], ['23:59', '11:59 p. m.'],
  ])('formatClock(%s) = %s', (input, expected) => {
    expect(formatClock(input)).toBe(expected);
  });

  it('formatClock tolera valores vacíos', () => {
    expect(formatClock('')).toBe('');
    expect(formatClock(undefined)).toBe('');
  });

  it('localIsoDate devuelve yyyy-mm-dd local, hoy o dentro de N días', () => {
    expect(localIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = new Date(`${localIsoDate()}T12:00:00`);
    const later = new Date(`${localIsoDate(HALL_MAX_ADVANCE_DAYS)}T12:00:00`);
    expect(Math.round((later - today) / 86400000)).toBe(HALL_MAX_ADVANCE_DAYS);
  });

  it('el salón se reserva con al menos un día de anticipación (desde mañana)', () => {
    expect(HALL_MIN_ADVANCE_DAYS).toBe(1);
    expect(localIsoDate(HALL_MIN_ADVANCE_DAYS) > localIsoDate()).toBe(true);
  });
});
