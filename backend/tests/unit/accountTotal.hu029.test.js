'use strict';
jest.mock('../../src/models', () => ({
  RestaurantAccount: { findByPk: jest.fn() }, RestaurantTable: {}, Product: {},
  AccountItem: { findAll: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({})) },
}));
const request = require('supertest');
const app = require('../../src/app');
const models = require('../../src/models');
const { calculateAccountTotal } = require('../../src/modules/restaurante/accountTotal.util');
const { getAccountTotal } = require('../../src/modules/restaurante/accountTotal.service');
const item = (over = {}) => ({ itemId: 1, productId: 2, quantity: 2, unitPrice: '1500.00', isRemoved: false, product: { name: 'Bebida', price: '9999.00' }, ...over });
beforeEach(() => {
  jest.clearAllMocks();
  models.RestaurantAccount.findByPk.mockResolvedValue({ accountId: 1, status: 'open', table: { tableNumber: 'PR-01' } });
  models.AccountItem.findAll.mockResolvedValue([item()]);
});
test('CA-1 subtotal, impuesto del 13% y total con precio registrado, no precio de catalogo', () => {
  expect(calculateAccountTotal([item(), item({ itemId: 2, quantity: 1, unitPrice: '2000.00' })])).toMatchObject({ subtotal: 5000, taxPercentage: 13, taxAmount: 650, total: 5650, message: null });
});
test('CA-2 una cuenta vacia informa cero sin error', () => {
  expect(calculateAccountTotal([])).toMatchObject({ lines: [], subtotal: 0, taxAmount: 0, total: 0, message: 'No hay consumos registrados aún' });
});
test('ignora consumos retirados aunque su cantidad sea invalida', () => {
  expect(calculateAccountTotal([item({ isRemoved: true, quantity: 0 })]).total).toBe(0);
});
test('calcula centimos sin errores binarios', () => {
  expect(calculateAccountTotal([item({ quantity: 3, unitPrice: '0.10' })])).toMatchObject({ subtotal: 0.3, taxAmount: 0.04, total: 0.34 });
});
test('redondea medio centimo hacia arriba y sobre el subtotal completo', () => {
  expect(calculateAccountTotal([item({ quantity: 1, unitPrice: '0.50' })]).taxAmount).toBe(0.07);
  expect(calculateAccountTotal([item({ quantity: 1, unitPrice: '0.05' }), item({ itemId: 2, quantity: 1, unitPrice: '0.05' })]).taxAmount).toBe(0.01);
});
test.each(['-1.00', 'abc', '1.005'])('rechaza precio corrupto %s sin subestimar el total', (unitPrice) => {
  expect(() => calculateAccountTotal([item({ unitPrice })])).toThrow();
});
test.each([0, -1, 1.5])('rechaza cantidad corrupta %s', (quantity) => {
  expect(() => calculateAccountTotal([item({ quantity })])).toThrow();
});
test('servicio usa una transaccion y solo consulta consumos no retirados', async () => {
  const result = await getAccountTotal(1);
  expect(result.total).toBe(3390);
  const query = models.AccountItem.findAll.mock.calls[0][0];
  expect(query.where).toEqual({ accountId: 1, isRemoved: false });
  expect(query.transaction).toBe(models.RestaurantAccount.findByPk.mock.calls[0][1].transaction);
});
test('cuenta inexistente devuelve 404 sin consultar consumos', async () => {
  models.RestaurantAccount.findByPk.mockResolvedValue(null);
  await expect(getAccountTotal(999)).rejects.toMatchObject({ statusCode: 404 });
  expect(models.AccountItem.findAll).not.toHaveBeenCalled();
});
test('consultas sucesivas recalculan cambios de cantidad y eliminacion', async () => {
  expect((await getAccountTotal(1)).subtotal).toBe(3000);
  models.AccountItem.findAll.mockResolvedValue([item({ quantity: 3 })]);
  expect((await getAccountTotal(1)).subtotal).toBe(4500);
  models.AccountItem.findAll.mockResolvedValue([]);
  expect((await getAccountTotal(1)).total).toBe(0);
});
test('API responde con total y valida numero de cuenta', async () => {
  expect((await request(app).get('/api/restaurant-accounts/1/total')).body.data.total).toBe(3390);
  models.RestaurantAccount.findByPk.mockClear();
  expect((await request(app).get('/api/restaurant-accounts/abc/total')).status).toBe(422);
  expect(models.RestaurantAccount.findByPk).not.toHaveBeenCalled();
});
