'use strict';

jest.mock('../../src/models', () => ({
  RestaurantAccount: { findByPk: jest.fn(), increment: jest.fn() },
  AccountItem: { findOne: jest.fn(), findAll: jest.fn() },
  Product: { findByPk: jest.fn() },
  RestaurantTable: { findByPk: jest.fn() },
  Customer: {}, AuditLog: { create: jest.fn() }, sequelize: { transaction: jest.fn() },
}));
const request = require('supertest');
const app = require('../../src/app');
const { RestaurantAccount, AccountItem, Product, RestaurantTable, AuditLog, sequelize } = require('../../src/models');
const { removeAccountItem } = require('../../src/modules/restaurante/cuentaPedido.service');

// Almacén transaccional simulado: las escrituras solo se publican al resolver
// el callback. Esto verifica propagación de la transacción, NO MySQL real.
let state; let transactions; let locks;
const itemUpdate = jest.fn();
const productUpdate = jest.fn();
const copy = (value) => JSON.parse(JSON.stringify(value));
const rowState = (options) => {
  expect(options.transaction).toBe(transactions.at(-1));
  return options.transaction.data;
};
const change = (overrides = {}) => removeAccountItem(5, 11, { expectedVersion: 4, userId: 1, ...overrides });
const noWrites = () => {
  expect(itemUpdate).not.toHaveBeenCalled();
  expect(productUpdate).not.toHaveBeenCalled();
  expect(RestaurantAccount.increment).not.toHaveBeenCalled();
  expect(AuditLog.create).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.resetAllMocks();
  transactions = []; locks = [];
  state = {
    account: { accountId: 5, tableId: 2, status: 'open', version: 4, customerId: 8, bookingId: 9 },
    items: [
      { itemId: 11, accountId: 5, productId: 1, quantity: 3, unitPrice: '4000.00', kitchenStatus: 'pending', isRemoved: false },
      { itemId: 12, accountId: 5, productId: 1, quantity: 1, unitPrice: '4500.00', kitchenStatus: 'pending', isRemoved: false },
    ],
    product: { productId: 1, name: 'Casado', price: '5000.00', stockQuantity: 10, isAvailable: true }, audits: [],
  };
  sequelize.transaction.mockImplementation(async (callback) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, data: copy(state), committed: false, rolledBack: false };
    transactions.push(transaction);
    try {
      const result = await callback(transaction);
      state = copy(transaction.data);
      transaction.committed = true;
      return result;
    } catch (error) { transaction.rolledBack = true; throw error; }
  });
  RestaurantAccount.findByPk.mockImplementation(async (id, options) => {
    if (options.lock) locks.push(['account', options.lock]);
    return copy(rowState(options).account);
  });
  AccountItem.findOne.mockImplementation(async (options) => {
    locks.push(['item', options.lock]);
    const item = rowState(options).items.find((entry) => entry.itemId === options.where.itemId && entry.accountId === options.where.accountId);
    return item ? { ...item, update: itemUpdate } : null;
  });
  Product.findByPk.mockImplementation(async (id, options) => {
    locks.push(['product', options.lock]);
    const product = rowState(options).product;
    return product ? { ...product, update: productUpdate } : null;
  });
  itemUpdate.mockImplementation(async (values, options) => Object.assign(rowState(options).items[0], values));
  productUpdate.mockImplementation(async (values, options) => Object.assign(rowState(options).product, values));
  RestaurantAccount.increment.mockImplementation(async (field, options) => { rowState(options).account[field] += options.by; });
  AuditLog.create.mockImplementation(async (values, options) => { rowState(options).audits.push(values); });
  RestaurantTable.findByPk.mockImplementation(async (id, options) => { rowState(options); return { tableId: id, tableNumber: '2' }; });
  AccountItem.findAll.mockImplementation(async (options) => rowState(options).items
    .filter((item) => item.accountId === options.where.accountId && !item.isRemoved)
    .map((item) => ({ ...item, product: rowState(options).product })));
});

describe('HU-027 retiro transaccional', () => {
  test('CA-1 conserva historial, devuelve stock sin reactivar, excluye línea y audita', async () => {
    state.product.isAvailable = false;
    const original = copy(state);
    const result = await change({ removedReason: ' Cliente desiste ' });
    expect(state.items[0]).toMatchObject({ ...original.items[0], isRemoved: true,
      removedByUserId: 1, removedReason: 'Cliente desiste' });
    expect(state.items[0].removedAt).toBeTruthy();
    expect(state.items[1]).toEqual(original.items[1]);
    expect(state.product).toEqual({ ...original.product, stockQuantity: 13 });
    expect(result).toMatchObject({ version: 5, itemCount: 1, accumulatedTotal: 4500 });
    expect(result.items.map(item => item.itemId)).toEqual([12]);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ action: 'restaurant_item_removed', userId: 1, entityId: 5 });
    expect(locks).toEqual([['account', 'UPDATE'], ['item', 'UPDATE'], ['product', 'UPDATE']]);
    expect(RestaurantAccount.increment).toHaveBeenCalledTimes(1);
  });
  test('segundo retiro con versión actual no devuelve stock nuevamente', async () => {
    await change(); const original = copy(state);
    await expect(change({ expectedVersion: 5 })).rejects.toMatchObject({ statusCode: 409, code: 'ITEM_REMOVED' });
    expect(state).toEqual(original);
    expect(productUpdate).toHaveBeenCalledTimes(1);
  });
  test('CA-3 dos clientes con misma versión: segundo no modifica nada', async () => {
    await change(); const original = copy(state);
    await expect(change()).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_VERSION_CONFLICT' });
    expect(state).toEqual(original);
    expect(productUpdate).toHaveBeenCalledTimes(1);
  });
  test.each(['sent', 'preparing', 'served'])('CA-2 rechaza %s sin escrituras', async (kitchenStatus) => {
    state.items[0].kitchenStatus = kitchenStatus; const original = copy(state);
    await expect(change()).rejects.toMatchObject({ statusCode: 409, code: 'ITEM_ALREADY_SENT' });
    noWrites(); expect(state).toEqual(original);
  });
  test.each(['closed', 'cancelled'])('CA-4 rechaza cuenta %s', async (status) => {
    state.account.status = status; const original = copy(state);
    await expect(change()).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_CLOSED' });
    noWrites(); expect(state).toEqual(original);
  });
  test.each([
    ['cuenta', () => { state.account = null; }],
    ['línea', () => { state.items = []; }],
    ['línea ajena', () => { state.items[0].accountId = 6; }],
    ['producto', () => { state.product = null; }],
  ])('404 para %s inexistente sin escrituras', async (_name, arrange) => {
    arrange(); await expect(change()).rejects.toMatchObject({ statusCode: 404 }); noWrites();
  });
  test.each(['item', 'product', 'version', 'audit', 'detail'])('rollback simulado ante fallo en %s', async (stage) => {
    const original = copy(state);
    ({ item: itemUpdate, product: productUpdate, version: RestaurantAccount.increment,
      audit: AuditLog.create, detail: AccountItem.findAll })[stage].mockRejectedValueOnce(new Error(stage));
    await expect(change()).rejects.toThrow(stage);
    expect(state).toEqual(original);
    expect(transactions[0]).toMatchObject({ committed: false, rolledBack: true });
  });
});
describe('HU-027 contrato HTTP', () => {
  const post = (body, path = '5/items/11') => request(app).post(`/api/restaurant-accounts/${path}/remove`).send(body);
  test('200 cuenta actualizada y 409 versión obsoleta', async () => {
    const response = await post({ expectedVersion: 4, userId: 1, removedReason: 'Desiste' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ version: 5, accumulatedTotal: 4500 });
    const stale = await post({ expectedVersion: 4 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('ACCOUNT_VERSION_CONFLICT');
  });
  test.each([{}, [], { expectedVersion: '4' }, { expectedVersion: 0 },
    { expectedVersion: 4, removedReason: 'x'.repeat(201) }, { expectedVersion: 4, removedReason: 3 },
    { expectedVersion: 4, quantity: 0 }, { expectedVersion: 4, userId: null }])('422 body inválido %p', async body => {
    expect((await post(body)).status).toBe(422); noWrites();
  });
  test.each(['0/items/11', 'abc/items/11', '5/items/0', '5/items/1.5'])('422 id %s', async path => {
    expect((await post({ expectedVersion: 4 }, path)).status).toBe(422); noWrites();
  });
  test.each(['sent', 'preparing', 'served'])('409 cocina %s', async status => {
    state.items[0].kitchenStatus = status;
    const response = await post({ expectedVersion: 4 });
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('ITEM_ALREADY_SENT'); noWrites();
  });
  test.each(['closed', 'cancelled'])('409 cuenta %s', async status => {
    state.account.status = status;
    const response = await post({ expectedVersion: 4 });
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('ACCOUNT_CLOSED'); noWrites();
  });
});
