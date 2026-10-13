'use strict';
jest.mock('../../src/models', () => ({
  RestaurantTable: { findByPk: jest.fn() }, Resource: { findOne: jest.fn() },
  RestaurantAccount: { count: jest.fn() }, Booking: { count: jest.fn() }, ResourceBlock: { count: jest.fn() },
  AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const app = require('../../src/app');
const models = require('../../src/models');
const { reactivateTable } = require('../../src/modules/restaurante/tableReactivate.service');
let table;
beforeEach(() => {
  jest.resetAllMocks();
  models.sequelize.transaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  table = { tableId: 1, resourceId: 7, status: 'inactive', update: jest.fn() };
  models.RestaurantTable.findByPk.mockResolvedValue(table);
  models.Resource.findOne.mockResolvedValue({ resourceId: 7, status: 'available' });
  models.RestaurantAccount.count.mockResolvedValue(0);
  models.Booking.count.mockResolvedValue(0);
  models.ResourceBlock.count.mockResolvedValue(0);
});
test('CA-1 reactiva y audita los estados y el editor en la misma transaccion', async () => {
  expect(await reactivateTable({ tableId: 1, userId: 8 })).toMatchObject({ tableId: 1, status: 'available' });
  expect(table.update).toHaveBeenCalledWith({ status: 'available' }, expect.any(Object));
  const [entry, options] = models.AuditLog.create.mock.calls[0];
  expect(entry).toMatchObject({ userId: 8, action: 'restaurant_table_reactivated', entityId: 1 });
  expect(JSON.parse(entry.details)).toMatchObject({ previousStatus: 'inactive', newStatus: 'available' });
  expect(options.transaction).toBe(table.update.mock.calls[0][1].transaction);
});
test.each(['available', 'occupied'])('CA-2 no modifica mesa ya activa %s', async (status) => {
  table.status = status;
  await expect(reactivateTable({ tableId: 1 })).rejects.toMatchObject({ statusCode: 409, message: 'La mesa ya se encuentra activa' });
  expect(table.update).not.toHaveBeenCalled();
  expect(models.AuditLog.create).not.toHaveBeenCalled();
});
test.each(['RestaurantAccount', 'Booking', 'ResourceBlock'])('no anuncia disponibilidad con bloqueo de %s', async (model) => {
  models[model].count.mockResolvedValue(1);
  await expect(reactivateTable({ tableId: 1 })).rejects.toMatchObject({ statusCode: 409 });
  expect(table.update).not.toHaveBeenCalled();
});
test('rechaza mantenimiento sin modificar el recurso', async () => {
  models.Resource.findOne.mockResolvedValue({ resourceId: 7, status: 'maintenance' });
  await expect(reactivateTable({ tableId: 1 })).rejects.toMatchObject({ statusCode: 409 });
  expect(table.update).not.toHaveBeenCalled();
});
test('mesa inexistente devuelve 404', async () => {
  models.RestaurantTable.findByPk.mockResolvedValue(null);
  await expect(reactivateTable({ tableId: 999 })).rejects.toMatchObject({ statusCode: 404 });
});
test('fallo de auditoria rechaza la transaccion', async () => {
  models.AuditLog.create.mockRejectedValue(new Error('Auditoria no disponible'));
  await expect(reactivateTable({ tableId: 1 })).rejects.toThrow('Auditoria no disponible');
});
test('API valida el identificador antes de consultar la mesa', async () => {
  expect((await request(app).post('/api/restaurant-tables/abc/reactivate')).status).toBe(422);
  expect(models.RestaurantTable.findByPk).not.toHaveBeenCalled();
});
