'use strict';

jest.mock('../../src/models', () => ({
  Booking: { findAndCountAll: jest.fn() },
  Resource: { name: 'Resource' },
  Customer: { name: 'Customer' },
}));

const { Booking } = require('../../src/models');
const service = require('../../src/modules/reservasCancha/reservasCancha.service');

afterEach(() => {
  jest.clearAllMocks();
});

describe('PU-HU-004-CA1-01', () => {
  it('con status valido lo agrega tal cual al where', () => {
    const resultado = service.buildListBookingsWhere({ status: 'active' });
    expect(resultado).toEqual({ status: 'active' });
  });
});

describe('PU-HU-004-CA2-01', () => {
  it('sin reservas del estado solicitado devuelve lista vacia', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const resultado = await service.filterFieldBookingsByStatus({ status: 'cancelled' });
    expect(resultado.items).toEqual([]);
    expect(resultado.total).toBe(0);
  });
});