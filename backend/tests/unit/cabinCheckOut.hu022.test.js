'use strict';
jest.mock('../../src/models', () => ({
  Booking: { findByPk: jest.fn() }, Resource: { findOne: jest.fn() },
  RestaurantAccount: { findAll: jest.fn() }, AccountItem: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() }, InvoiceLine: { findAll: jest.fn() },
  AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../../src/app');
const models = require('../../src/models');
const { checkOutCabin } = require('../../src/modules/reservasCabina/cabinCheckOut.service');
const now = new Date('2026-10-13T02:00:00Z');
let booking;
beforeEach(() => {
  jest.resetAllMocks();
  models.sequelize.transaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  booking = { bookingId: 5, customerId: 7, resourceId: 3, status: 'checked_in', update: jest.fn() };
  models.Booking.findByPk.mockResolvedValue(booking);
  models.Resource.findOne.mockResolvedValue({ resourceId: 3 });
  models.RestaurantAccount.findAll.mockResolvedValue([]);
  models.AccountItem.findAll.mockResolvedValue([]);
  models.Invoice.findAll.mockResolvedValue([]);
  models.InvoiceLine.findAll.mockResolvedValue([]);
});
test('CA-1 finaliza y audita la salida real en la misma transaccion', async () => {
  expect(await checkOutCabin({ bookingId: 5, userId: 8, now })).toEqual({ bookingId: 5, status: 'completed', actualCheckOut: now.toISOString() });
  expect(booking.update).toHaveBeenCalledWith({ status: 'completed' }, expect.any(Object));
  const [entry, options] = models.AuditLog.create.mock.calls[0];
  expect(entry).toMatchObject({ action: 'cabin_check_out', entityId: 5, userId: 8 });
  expect(JSON.parse(entry.details).actualCheckOut).toBe(now.toISOString());
  expect(options.transaction).toBe(booking.update.mock.calls[0][1].transaction);
});
test('CA-2 bloquea consumos sin facturacion verificable, sin finalizar ni auditar una salida', async () => {
  models.RestaurantAccount.findAll.mockResolvedValue([{ accountId: 9 }]);
  models.AccountItem.findAll.mockResolvedValue([{ itemId: 10, quantity: 2, unitPrice: '1500.00' }]);
  await expect(checkOutCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 409, code: 'UNVERIFIED_RESTAURANT_BILLING', message: 'Existen consumos pendientes de facturar' });
  expect(booking.update).not.toHaveBeenCalled();
  expect(models.AuditLog.create).not.toHaveBeenCalled();
  expect(models.RestaurantAccount.findAll.mock.calls[0][0].where.status[Op.ne]).toBe('cancelled');
  expect(models.AccountItem.findAll.mock.calls[0][0].where.isRemoved).toBe(false);
});

test('permite salir cuando cada consumo esta cubierto por una factura generada o pagada del mismo huesped y reserva', async () => {
  models.RestaurantAccount.findAll.mockResolvedValue([{ accountId: 9 }]);
  models.AccountItem.findAll.mockResolvedValue([{ itemId: 10, quantity: 2, unitPrice: '1500.00' }]);
  models.Invoice.findAll.mockResolvedValue([{ invoiceId: 12 }]);
  models.InvoiceLine.findAll.mockResolvedValue([{ sourceId: 10, amount: '3000.00' }]);
  expect((await checkOutCabin({ bookingId: 5, now })).status).toBe('completed');
  const where = models.Invoice.findAll.mock.calls[0][0].where;
  expect(where).toMatchObject({ bookingId: 5, customerId: 7 });
  expect(where.status[Op.in]).toEqual(['pending', 'paid']);
});

test.each([[11, '3000.00'], [10, '1500.00']])('no acepta linea ajena o importe incompleto (%s, %s)', async (sourceId, amount) => {
  models.RestaurantAccount.findAll.mockResolvedValue([{ accountId: 9 }]);
  models.AccountItem.findAll.mockResolvedValue([{ itemId: 10, quantity: 2, unitPrice: '1500.00' }]);
  models.Invoice.findAll.mockResolvedValue([{ invoiceId: 12 }]);
  models.InvoiceLine.findAll.mockResolvedValue([{ sourceId, amount }]);
  await expect(checkOutCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 409 });
  expect(booking.update).not.toHaveBeenCalled();
});
test('una cuenta vacia o solo con consumos retirados no bloquea la salida', async () => {
  models.RestaurantAccount.findAll.mockResolvedValue([{ accountId: 9 }]);
  expect((await checkOutCabin({ bookingId: 5, now })).status).toBe('completed');
});
test('CA-3 rechaza salida duplicada', async () => {
  booking.status = 'completed';
  await expect(checkOutCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 409, message: 'El check-out de esta reserva ya fue registrado' });
  expect(booking.update).not.toHaveBeenCalled();
});
test.each(['active', 'pending', 'cancelled', 'rejected'])('rechaza reserva %s sin ingreso registrado', async (status) => {
  booking.status = status;
  await expect(checkOutCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 409 });
  expect(models.RestaurantAccount.findAll).not.toHaveBeenCalled();
});
test('rechaza reserva inexistente o de otro recurso', async () => {
  models.Booking.findByPk.mockResolvedValueOnce(null);
  await expect(checkOutCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 404 });
  models.Resource.findOne.mockResolvedValueOnce(null);
  await expect(checkOutCabin({ bookingId: 5, now })).rejects.toMatchObject({ statusCode: 404 });
});
test('el fallo de auditoria aborta la operacion', async () => {
  models.AuditLog.create.mockRejectedValue(new Error('Auditoria no disponible'));
  await expect(checkOutCabin({ bookingId: 5, now })).rejects.toThrow('Auditoria no disponible');
});
test('valida el identificador en la API', async () => {
  expect((await request(app).post('/api/cabin-bookings/abc/check-out')).status).toBe(422);
  expect(models.Booking.findByPk).not.toHaveBeenCalled();
});
