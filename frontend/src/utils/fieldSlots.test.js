import { describe, expect, it } from 'vitest';
import { buildSlotsFromReservations, slotToIsoRange } from './fieldSlots';

const date = '2026-10-29';
const now = new Date('2026-10-28T12:00:00-06:00');
const reservation = (start, end, estado = 'Confirmada') => ({ id: 1, cliente: 'Prueba existente', startDatetime: `${date}T${start}:00-06:00`, endDatetime: `${date}T${end}:00-06:00`, estado });

describe('horarios de cancha de una hora', () => {
  it('permite seis reservas entre las 15 y las 21, sin ofrecer una salida a las 22', () => {
    expect(buildSlotsFromReservations([], date, now).map((slot) => slot.hour)).toEqual([15, 16, 17, 18, 19, 20]);
    const range = slotToIsoRange(date, 20);
    expect(range.endDatetime).toBe('2026-10-30T03:00:00.000Z');
    expect(new Date(range.endDatetime) - new Date(range.startDatetime)).toBe(3600000);
  });
  it('mantiene ocupadas las dos horas de una reserva anterior sin duplicar el resto', () => {
    const slots = buildSlotsFromReservations([reservation('15:00', '17:00')], date, now);
    expect(slots.filter((slot) => slot.status === 'occupied').map((slot) => slot.hour)).toEqual([15, 16]);
    expect(slots.find((slot) => slot.hour === 17).status).toBe('available');
  });
  it('bloquea ambos bloques cuando una reserva con minutos cruza el límite horario', () => {
    expect(buildSlotsFromReservations([reservation('16:30', '17:30', 'Pendiente')], date, now).filter((slot) => slot.status === 'pending').map((slot) => slot.hour)).toEqual([16, 17]);
  });
  it('una reserva terminada exactamente a las 15 no bloquea el primer bloque', () => {
    expect(buildSlotsFromReservations([reservation('13:00', '15:00')], date, now)[0].status).toBe('available');
  });
  it('una hora pasada permanece deshabilitada sin ocultar una reserva existente', () => {
    const slots = buildSlotsFromReservations([reservation('15:00', '16:00')], date, new Date(`${date}T16:30:00-06:00`));
    expect(slots[0].status).toBe('occupied');
    expect(slots[1].status).toBe('past');
    expect(slots[2].status).toBe('available');
  });
});
