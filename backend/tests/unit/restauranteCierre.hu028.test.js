'use strict';
jest.mock('../../src/models', () => ({
  RestaurantAccount: { findByPk: jest.fn(), findOne: jest.fn() },
  RestaurantTable: { findByPk: jest.fn() }, Resource: { findByPk: jest.fn() },
  AccountItem: { findOne: jest.fn(), findAll: jest.fn(), destroy: jest.fn(), update: jest.fn() },
  Product: { update: jest.fn() }, Customer: {}, AuditLog: { create: jest.fn() },
  Invoice: { create: jest.fn() }, Payment: { create: jest.fn() }, sequelize: { transaction: jest.fn() },
}));
const request = require('supertest');
const app = require('../../src/app');
const models = require('../../src/models');
const { closeAccount } = require('../../src/modules/restaurante/cuentaPedido.service');
const { RestaurantAccount, RestaurantTable, Resource, AccountItem, AuditLog, sequelize } = models;
const clone = value => JSON.parse(JSON.stringify(value));
let state; let tx; let locks;
const accountUpdate = jest.fn(); const tableUpdate = jest.fn();
const data = options => { expect(options.transaction).toBe(tx); return tx.data; };
const close = (options = {}) => closeAccount(5, { expectedVersion: 4, userId: 1, ...options });
beforeEach(() => {
  jest.resetAllMocks(); locks = [];
  state = {
    account: { accountId: 5, tableId: 2, status: 'open', version: 4, closedAt: null },
    table: { tableId: 2, resourceId: 7, tableNumber: '2', status: 'occupied' },
    resource: { resourceId: 7, resourceType: 'restaurant_table', status: 'available' },
    items: [{ itemId: 11, accountId: 5, quantity: 2, unitPrice: '4000.00', isRemoved: false, kitchenStatus: 'pending' }],
    audits: [], other: null,
  };
  sequelize.transaction.mockImplementation(async (options, callback) => {
    expect(options.isolationLevel).toBe('READ COMMITTED');
    tx = { LOCK: { UPDATE: 'UPDATE' }, data: clone(state), rolledBack: false };
    try { const result = await callback(tx); state = clone(tx.data); return result; }
    catch (error) { tx.rolledBack = true; throw error; }
  });
  accountUpdate.mockImplementation(async function(values, options) {
    Object.assign(data(options).account, values); data(options).account.version += 1;
    Object.assign(this, data(options).account); // Sequelize versioned instance update.
  });
  tableUpdate.mockImplementation(async function(values, options) {
    Object.assign(data(options).table, values); Object.assign(this, values);
  });
  RestaurantAccount.findByPk.mockImplementation(async (id, options) => {
    if (options.lock) locks.push('account');
    const row = data(options).account; return row ? { ...row, update: accountUpdate } : null;
  });
  RestaurantAccount.findOne.mockImplementation(async options => data(options).other);
  RestaurantTable.findByPk.mockImplementation(async (id, options) => {
    if (options.lock) locks.push('table');
    const row = data(options).table; return row ? { ...row, update: tableUpdate } : null;
  });
  Resource.findByPk.mockImplementation(async (id, options) => { locks.push('resource'); return data(options).resource; });
  AccountItem.findOne.mockImplementation(async options => {
    expect(options.where).toEqual({ accountId: 5, isRemoved: false });
    expect(options.lock).toBe('UPDATE'); return data(options).items.find(item => !item.isRemoved);
  });
  AccountItem.findAll.mockImplementation(async options => data(options).items.filter(item => !item.isRemoved));
  AuditLog.create.mockImplementation(async (values, options) => data(options).audits.push(values));
});
afterEach(() => {
  expect(models.Invoice.create).not.toHaveBeenCalled(); expect(models.Payment.create).not.toHaveBeenCalled();
  expect(models.Product.update).not.toHaveBeenCalled(); expect(AccountItem.update).not.toHaveBeenCalled();
  expect(AccountItem.destroy).not.toHaveBeenCalled();
});
test('CA-1 cierre conserva consumos/importes, libera ocupación, conserva Resource, versiona y audita', async () => {
  const original = clone(state); const result = await close();
  expect(state.account).toMatchObject({ status: 'closed', version: 5 });
  expect(state.account.closedAt).toBeTruthy(); expect(state.items).toEqual(original.items);
  expect(state.table.status).toBe('available'); expect(state.resource).toEqual(original.resource);
  expect(result).toMatchObject({ status: 'closed', version: 5, accumulatedTotal: 8000, tableStatus: 'available' });
  expect(state.audits).toHaveLength(1);
  expect(state.audits[0]).toMatchObject({ action: 'restaurant_account_closed', entityId: 5, userId: 1 });
  expect(locks).toEqual(['resource', 'table', 'account']);
});
test.each([[[]], [[{ itemId: 1, isRemoved: true }]]])('CA-2 sin consumos activos %p', async items => {
  state.items = items; const original = clone(state);
  await expect(close()).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_EMPTY' });
  expect(state).toEqual(original); expect(accountUpdate).not.toHaveBeenCalled();
});
test.each(['closed', 'cancelled'])('CA-3 y canceladas: %s sin cambios', async status => {
  state.account.status = status; const original = clone(state);
  await expect(close()).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_CLOSED' });
  expect(state).toEqual(original); expect(accountUpdate).not.toHaveBeenCalled();
});
test('segundo cierre no repite operaciones', async () => {
  await close(); const original = clone(state);
  await expect(close({ expectedVersion: 5 })).rejects.toMatchObject({ code: 'ACCOUNT_CLOSED' });
  expect(state).toEqual(original); expect(accountUpdate).toHaveBeenCalledTimes(1);
});
test('versión obsoleta no modifica nada', async () => {
  state.account.version = 5; const original = clone(state);
  await expect(close()).rejects.toMatchObject({ code: 'ACCOUNT_VERSION_CONFLICT', statusCode: 409 });
  expect(state).toEqual(original);
});
test.each(['pending', 'sent', 'preparing', 'served'])('no impone restricción de cocina %s', async kitchenStatus => {
  state.items[0].kitchenStatus = kitchenStatus; await close(); expect(state.account.status).toBe('closed');
});
test.each(['inactive', 'maintenance'])('conserva Resource %s y no habilita la mesa', async status => {
  state.resource.status = status; await close();
  expect(state.resource.status).toBe(status); expect(state.table.status).toBe('inactive');
});
test('conserva mesa inactiva', async () => {
  state.table.status = 'inactive'; await close(); expect(state.table.status).toBe('inactive');
});
test('otra cuenta abierta conserva ocupación', async () => {
  state.other = { accountId: 9 }; await close(); expect(state.table.status).toBe('occupied');
});
test('conserva líneas retiradas, sin sumarlas al total', async () => {
  state.items.push({ itemId: 12, quantity: 10, unitPrice: 500, isRemoved: true });
  const original = clone(state.items); const result = await close();
  expect(result.accumulatedTotal).toBe(8000); expect(state.items).toEqual(original);
});
test.each(['account', 'table', 'audit', 'detail'])('rollback simulado ante fallo %s', async stage => {
  const original = clone(state);
  ({ account: accountUpdate, table: tableUpdate, audit: AuditLog.create, detail: AccountItem.findAll })[stage].mockRejectedValueOnce(new Error(stage));
  await expect(close()).rejects.toThrow(stage); expect(tx.rolledBack).toBe(true); expect(state).toEqual(original);
});
const post = (body, id = 5) => request(app).post(`/api/restaurant-accounts/${id}/close`).send(body);
test('HTTP 200 y segundo cierre 409', async () => {
  expect((await post({ expectedVersion: 4 })).status).toBe(200);
  const response = await post({ expectedVersion: 5 });
  expect(response.status).toBe(409); expect(response.body.error.code).toBe('ACCOUNT_CLOSED');
});
test.each([{}, [], { expectedVersion: '4' }, { expectedVersion: 0 }, { expectedVersion: 4, status: 'closed' }, { expectedVersion: 4, userId: null }])('HTTP 422 body %p', async body => {
  expect((await post(body)).status).toBe(422); expect(sequelize.transaction).not.toHaveBeenCalled();
});
test.each(['0', 'abc', '1.5'])('HTTP 422 id %s', async id => {
  expect((await post({ expectedVersion: 4 }, id)).status).toBe(422);
});
test('HTTP 404 cuenta inexistente', async () => {
  state.account = null; expect((await post({ expectedVersion: 4 })).status).toBe(404);
});
test('HTTP 409 sin consumos', async () => {
  state.items = []; const result = await post({ expectedVersion: 4 });
  expect(result.status).toBe(409); expect(result.body.error.code).toBe('ACCOUNT_EMPTY');
});

test('HTTP 409 versión obsoleta informa versión actual', async () => {
  state.account.version = 6;
  const result = await post({ expectedVersion: 4 });
  expect(result.status).toBe(409);
  expect(result.body.error).toMatchObject({ code: 'ACCOUNT_VERSION_CONFLICT', details: { currentVersion: 6 } });
  expect(accountUpdate).not.toHaveBeenCalled();
});
test('revalida asociación bajo bloqueo antes de escribir', async () => {
  state.resource.resourceId = 99; const original = clone(state);
  await expect(close()).rejects.toMatchObject({ code: 'TABLE_RESOURCE_INVALID' });
  expect(state).toEqual(original);
});
