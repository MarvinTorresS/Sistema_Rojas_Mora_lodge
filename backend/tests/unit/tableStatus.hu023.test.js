'use strict';
jest.mock('../../src/models', () => ({
  RestaurantTable: { findAll: jest.fn() }, Resource: {},
  RestaurantAccount: { findAll: jest.fn() }, Booking: { findAll: jest.fn() },
  ResourceBlock: { findAll: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({})) },
}));
const { Op } = require('sequelize');
const models = require('../../src/models');
const { listTableStatuses } = require('../../src/modules/restaurante/tableStatus.service');
const request = require('supertest');
const app = require('../../src/app');
const now = new Date('2026-10-13T02:00:00Z');
const table = (id, over = {}) => ({ tableId: id, resourceId: id + 10, tableNumber: String(id), seatCount: 4, status: 'available', resource: { status: 'available' }, ...over });
beforeEach(() => {
  jest.clearAllMocks();
  models.RestaurantTable.findAll.mockResolvedValue([table(1), table(2), table(3)]);
  models.RestaurantAccount.findAll.mockResolvedValue([]);
  models.Booking.findAll.mockResolvedValue([]);
  models.ResourceBlock.findAll.mockResolvedValue([]);
});
test('CA-1 muestra disponible, ocupada y reservada sin datos de clientes', async () => {
  models.RestaurantAccount.findAll.mockResolvedValue([{ tableId: 2 }]);
  models.Booking.findAll.mockResolvedValue([{ resourceId: 13 }]);
  const result = await listTableStatuses({ now });
  expect(result.items.map((t) => t.status)).toEqual(['available', 'occupied', 'reserved']);
  expect(result.items[0]).toEqual({ tableId: 1, tableNumber: '1', seatCount: 4, status: 'available' });
  expect(result.counts).toEqual({ available: 1, occupied: 1, reserved: 1, unavailable: 0 });
  expect(result.message).toBeNull();
});
test('CA-2 avisa cuando todas estan ocupadas o reservadas', async () => {
  models.RestaurantAccount.findAll.mockResolvedValue([{ tableId: 1 }, { tableId: 2 }]);
  models.Booking.findAll.mockResolvedValue([{ resourceId: 13 }]);
  expect((await listTableStatuses({ now })).message).toBe('No hay mesas disponibles en este momento');
});
test('sin mesas configuradas no consulta cuentas ni anuncia mesas ocupadas', async () => {
  models.RestaurantTable.findAll.mockResolvedValue([]);
  expect(await listTableStatuses({ now })).toMatchObject({ items: [], message: null });
  expect(models.Booking.findAll).not.toHaveBeenCalled();
});
test('separa mesas inactivas, recursos en mantenimiento y bloqueos vigentes', async () => {
  models.RestaurantTable.findAll.mockResolvedValue([table(1, { status: 'inactive' }), table(2, { resource: { status: 'maintenance' } }), table(3)]);
  models.ResourceBlock.findAll.mockResolvedValue([{ resourceId: 13 }]);
  expect((await listTableStatuses({ now })).counts.unavailable).toBe(3);
});
test('una cuenta abierta tiene prioridad sobre reserva y los numeros se ordenan naturalmente', async () => {
  models.RestaurantTable.findAll.mockResolvedValue([table(10), table(2)]);
  models.RestaurantAccount.findAll.mockResolvedValue([{ tableId: 2 }]);
  models.Booking.findAll.mockResolvedValue([{ resourceId: 12 }]);
  expect((await listTableStatuses({ now })).items.map((t) => [t.tableNumber, t.status])).toEqual([['2', 'occupied'], ['10', 'available']]);
});
test('solo reservas y bloqueos vigentes: inicio inclusivo y fin exclusivo', async () => {
  await listTableStatuses({ now });
  const where = models.Booking.findAll.mock.calls[0][0].where;
  expect(where.startDatetime[Op.lte]).toBe(now);
  expect(where.endDatetime[Op.gt]).toBe(now);
  expect(where.status[Op.in]).toEqual(['pending', 'active', 'checked_in']);
  expect(models.ResourceBlock.findAll.mock.calls[0][0].where.isActive).toBe(true);
});
test('un estado ocupado almacenado tambien se respeta', async () => {
  models.RestaurantTable.findAll.mockResolvedValue([table(1, { status: 'occupied' })]);
  expect((await listTableStatuses({ now })).items[0].status).toBe('occupied');
});
test('endpoint responde con estados y conteos', async () => {
  const response = await request(app).get('/api/restaurant-tables/status');
  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(3);
  expect(response.body.meta.counts.available).toBe(3);
});
