import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import api from './api';
import {
  checkHallAvailability, createHallBooking, getHallSchedule, updateHallBooking,
} from './reservasSalonService';

// El salón se reserva por día: solo viaja la fecha (yyyy-mm-dd); la entrada y
// la salida las fija el servidor.
describe('reservasSalonService (reserva por día)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pide el horario fijo de entrada y salida', async () => {
    api.get.mockResolvedValue({ data: { data: { checkInTime: '15:00', checkOutTime: '20:00' } } });
    expect(await getHallSchedule()).toEqual({ checkInTime: '15:00', checkOutTime: '20:00' });
    expect(api.get).toHaveBeenCalledWith('/hall-bookings/schedule');
  });

  it('consulta la disponibilidad con la fecha', async () => {
    api.get.mockResolvedValue({ data: { data: { available: true, reason: null } } });
    await checkHallAvailability({ resourceId: 2, date: '2026-11-20' });
    expect(api.get).toHaveBeenCalledWith('/hall-bookings/availability', { params: { resourceId: 2, date: '2026-11-20' } });
  });

  it('registra la reserva con la fecha y sin plan ni horas', async () => {
    api.post.mockResolvedValue({ data: { data: { booking: { bookingId: 1 } } } });
    const payload = {
      resourceId: 2, customerName: 'Ana Mora', customerPhone: '88887777', date: '2026-11-20',
    };
    await createHallBooking(payload);
    expect(api.post).toHaveBeenCalledWith('/hall-bookings', payload);
  });

  it('cambia el día de una reserva con PATCH', async () => {
    api.patch.mockResolvedValue({ data: { data: { bookingId: 8 } } });
    await updateHallBooking(8, { date: '2026-11-21' });
    expect(api.patch).toHaveBeenCalledWith('/hall-bookings/8', { date: '2026-11-21' });
  });

  it('un error del servidor conserva su mensaje y código', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('x'), {
      response: { status: 409, data: { error: { message: 'El salon ya tiene una reserva ese dia.', code: 'X' } } },
    }));
    const error = await createHallBooking({}).catch((e) => e);
    expect(error.message).toBe('El salon ya tiene una reserva ese dia.');
    expect(error.status).toBe(409);
  });
});
