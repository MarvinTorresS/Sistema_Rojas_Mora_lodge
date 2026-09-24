'use strict';

jest.mock('../../src/models', () => ({
  Booking: { findByPk: jest.fn() },
  AuditLog: { create: jest.fn() },
}));

const { Booking, AuditLog } = require('../../src/models');
const service = require('../../src/modules/reservasCancha/reservasCancha.service');

afterEach(() => {
  jest.clearAllMocks();
});

describe('PU-HU-006-CA1-01', () => {
  it('cancela dentro de la ventana de anticipacion sin generar auditoria', async () => {
    const booking = {
      status: 'active',
      startDatetime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      save: jest.fn().mockResolvedValue(),
    };
    Booking.findByPk.mockResolvedValue(booking);

    await service.cancelFieldBooking(15, { reason: 'Cambio de planes del cliente' });

    expect(booking.status).toBe('cancelled');
    expect(booking.cancellationReason).toBe('Cambio de planes del cliente');
    expect(AuditLog.create).not.toHaveBeenCalled();
  });
});

describe('PU-HU-006-CA3-01', () => {
  it('rechaza cancelacion tardia sin rol Administrador', async () => {
    const booking = {
      status: 'active',
      startDatetime: new Date(Date.now() + 5 * 60 * 60 * 1000),
      save: jest.fn(),
    };
    Booking.findByPk.mockResolvedValue(booking);
    await expect(service.cancelFieldBooking(15, { reason: 'Motivo valido' }))
      .rejects.toMatchObject({ statusCode: 409, message: 'La cancelación ya no está permitida con menos de 24 horas de anticipación.' });
    expect(booking.save).not.toHaveBeenCalled();
  });
});

describe('PU-HU-006-CA4-01', () => {
  it('rechaza cancelar una reserva ya cancelada', async () => {
    Booking.findByPk.mockResolvedValue({ status: 'cancelled' });
    await expect(service.cancelFieldBooking(15, { reason: 'Motivo' }))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 409, message: 'La reserva ya se encuentra cancelada.' });
  });
});

describe('PU-HU-006-CA5-01', () => {
  it.each([
    ['', 'El motivo de cancelación es obligatorio.'],
    ['   ', 'El motivo de cancelación es obligatorio.'],
    ['a'.repeat(251), 'El motivo de cancelación no puede superar los 250 caracteres.'],
  ])('rechaza motivo invalido: %j', async (reason, mensajeEsperado) => {
    Booking.findByPk.mockResolvedValue({
      status: 'active',
      startDatetime: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    await expect(service.cancelFieldBooking(15, { reason }))
      .rejects.toMatchObject({ statusCode: 422, message: mensajeEsperado });
  });
});

describe('PU-HU-006-CA6-01', () => {
  it('permite cancelacion tardia autorizada por Administrador y la audita', async () => {
    const booking = {
      status: 'active',
      startDatetime: new Date(Date.now() + 5 * 60 * 60 * 1000),
      save: jest.fn().mockResolvedValue(),
    };
    Booking.findByPk.mockResolvedValue(booking);

    await service.cancelFieldBooking(15, {
      reason: 'Autorizado por gerencia',
      role: 'Administrador',
      authorizedByUserId: 2,
    });

    expect(booking.status).toBe('cancelled');
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2,
      action: 'field_booking_cancelled_out_of_policy',
      entityType: 'booking',
    }));
  });
});