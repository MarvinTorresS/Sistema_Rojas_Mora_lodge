'use strict';

jest.mock('../../src/models', () => ({
  Booking: { findByPk: jest.fn(), findOne: jest.fn() },
  Resource: { findOne: jest.fn() }, AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const app = require('../../src/app');
const { Booking, Resource, AuditLog } = require('../../src/models');
const { checkInCabin } = require('../../src/modules/reservasCabina/cabinCheckIn.service');
const now = new Date('2026-10-13T01:00:00Z'); // En Costa Rica todavia es 12 de octubre.
let booking;
beforeEach(() => {
  jest.resetAllMocks();
  const { sequelize } = require('../../src/models');
  sequelize.transaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  booking = { bookingId: 5, resourceId: 3, status: 'active', startDatetime: new Date('2026-10-12T21:00:00Z'), update: jest.fn() };
  Booking.findByPk.mockResolvedValue(booking);
  Booking.findOne.mockResolvedValue(null);
  Resource.findOne.mockResolvedValue({ resourceId: 3, status: 'available' });
});

test('CA-1 registra ingreso segun fecha de Costa Rica y audita fecha real en la misma transaccion', async () => {
  const result = await checkInCabin({ bookingId: 5, now, userId: 8 });
  expect(result).toEqual({ bookingId: 5, status: 'checked_in', actualCheckIn: now.toISOString() });
  expect(booking.update).toHaveBeenCalledWith({ status: 'checked_in' }, expect.any(Object));
  const [entry, options] = AuditLog.create.mock.calls[0];
  expect(entry).toMatchObject({ userId: 8, action: 'cabin_check_in', entityId: 5 });
  expect(JSON.parse(entry.details).actualCheckIn).toBe(now.toISOString());
  expect(options.transaction).toBe(booking.update.mock.calls[0][1].transaction);
});
test('CA-2 impide ingreso anticipado', async () => {
  booking.startDatetime = new Date('2026-10-13T21:00:00Z');
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 422, message: 'No es posible realizar el check-in antes de la fecha de entrada' });
  expect(booking.update).not.toHaveBeenCalled();
});
test('CA-3 impide duplicados', async () => {
  booking.status = 'checked_in';
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 409, message: 'El check-in de esta reserva ya fue registrado' });
  expect(AuditLog.create).not.toHaveBeenCalled();
});
test.each(['cancelled', 'completed', 'pending', 'rejected'])('rechaza reserva %s', async (status) => {
  booking.status = status;
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 409 });
  expect(booking.update).not.toHaveBeenCalled();
});
test('rechaza fecha anterior', async () => {
  booking.startDatetime = new Date('2026-10-11T21:00:00Z');
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 422 });
});
test('rechaza reserva inexistente y reserva que no es de cabina', async () => {
  Booking.findByPk.mockResolvedValueOnce(null);
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 404 });
  Resource.findOne.mockResolvedValueOnce(null);
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 404 });
});
test('impide ingreso en cabina ocupada', async () => {
  Booking.findOne.mockResolvedValue({ bookingId: 6 });
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 409 });
  expect(booking.update).not.toHaveBeenCalled();
});
test('fallo de auditoria rechaza la transaccion', async () => {
  AuditLog.create.mockRejectedValue(new Error('Auditoria no disponible'));
  await expect(checkInCabin({ bookingId: 5, now })).rejects.toThrow('Auditoria no disponible');
});
test('endpoint valida el identificador antes de consultar datos', async () => {
  const result = await request(app).post('/api/cabin-bookings/abc/check-in');
  expect(result.status).toBe(422);
  expect(Booking.findByPk).not.toHaveBeenCalled();
});
