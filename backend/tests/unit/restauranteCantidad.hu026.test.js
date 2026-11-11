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
const { updateItemQuantity, getAccount } = require('../../src/modules/restaurante/cuentaPedido.service');

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
const change = (overrides = {}) => updateItemQuantity(5, 11, { quantity: 5, expectedVersion: 4, userId: 1, ...overrides });
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

describe('HU-026 actualización transaccional de cantidades', () => {
  test('aumenta solo la línea seleccionada, conserva precio histórico, recalcula y audita una vez', async () => {
    const original = copy(state);
    const detail = await change();
    expect(state.items[0]).toEqual({ ...original.items[0], quantity: 5 });
    expect(state.items[1]).toEqual(original.items[1]);
    expect(state.product.stockQuantity).toBe(8);
    expect(detail.items[0]).toMatchObject({ itemId: 11, quantity: 5, unitPrice: 4000, subtotal: 20000 });
    expect(detail.accumulatedTotal).toBe(24500);
    expect(detail.version).toBe(5);
    expect(state.account).toEqual({ ...original.account, version: 5 });
    expect(RestaurantAccount.increment).toHaveBeenCalledTimes(1);
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    expect(state.audits[0]).toMatchObject({ userId: 1, action: 'restaurant_item_quantity_updated', entityId: 5 });
    expect(JSON.parse(state.audits[0].details)).toEqual({ accountId: 5, itemId: 11, productId: 1, previousQuantity: 3, quantity: 5, difference: 2 });
    expect(locks).toEqual([['account', 'UPDATE'], ['item', 'UPDATE'], ['product', 'UPDATE']]);
    expect(transactions[0].committed).toBe(true);
  });

  test('disminuye y devuelve únicamente la diferencia sin reactivar un producto', async () => {
    state.product.isAvailable = false;
    const detail = await change({ quantity: 1 });
    expect(state.product).toMatchObject({ stockQuantity: 12, isAvailable: false });
    expect(detail.items[0].subtotal).toBe(4000);
    expect(detail.accumulatedTotal).toBe(8500);
  });

  test('al agotar las existencias conserva la convención de disponibilidad', async () => {
    state.product.stockQuantity = 2;
    await change();
    expect(state.product).toMatchObject({ stockQuantity: 0, isAvailable: false });
  });

  test('misma cantidad valida las reglas pero no escribe ni incrementa', async () => {
    const original = copy(state);
    expect((await change({ quantity: 3 })).version).toBe(4);
    noWrites(); expect(state).toEqual(original);
  });

  test.each([0, -1, 1.5, null, '', '5', true, 100, undefined])('rechaza cantidad inválida %p sin transacción', async (quantity) => {
    await expect(change({ quantity })).rejects.toMatchObject({ statusCode: 422 });
    expect(sequelize.transaction).not.toHaveBeenCalled(); noWrites();
  });

  test.each(['closed', 'cancelled'])('rechaza cuenta %s', async (status) => {
    state.account.status = status;
    await expect(change()).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_CLOSED' });
    noWrites(); expect(AccountItem.findOne).not.toHaveBeenCalled();
  });

  test.each(['sent', 'preparing', 'served'])('rechaza cocina %s incluso sin diferencia de cantidad', async (kitchenStatus) => {
    state.items[0].kitchenStatus = kitchenStatus;
    await expect(change({ quantity: 3 })).rejects.toMatchObject({ statusCode: 409, code: 'ITEM_ALREADY_SENT' });
    noWrites();
  });

  test.each([
    ['cuenta inexistente', () => { state.account = null; }, 404],
    ['línea inexistente', () => { state.items = []; }, 404],
    ['línea ajena', () => { state.items[0].accountId = 6; }, 404],
    ['línea retirada', () => { state.items[0].isRemoved = true; }, 409],
    ['producto inexistente', () => { state.product = null; }, 404],
  ])('rechaza %s sin escrituras', async (_name, arrange, statusCode) => {
    arrange(); const original = copy(state);
    await expect(change()).rejects.toMatchObject({ statusCode });
    noWrites(); expect(state).toEqual(original);
  });

  test.each([
    [1, true, 'INSUFFICIENT_STOCK'],
    [0, false, 'PRODUCT_OUT_OF_STOCK'],
    [10, false, 'PRODUCT_UNAVAILABLE'],
  ])('rechaza aumento con stock %s y disponible %s', async (stockQuantity, isAvailable, code) => {
    Object.assign(state.product, { stockQuantity, isAvailable });
    const original = copy(state);
    await expect(change()).rejects.toMatchObject({ statusCode: 409, code });
    noWrites(); expect(state).toEqual(original);
  });

  test('dos clientes con versión 4: el segundo es rechazado después del primer commit simulado', async () => {
    await change();
    const afterFirst = copy(state);
    itemUpdate.mockClear(); productUpdate.mockClear(); RestaurantAccount.increment.mockClear(); AuditLog.create.mockClear();
    await expect(change({ quantity: 2 })).rejects.toMatchObject({
      statusCode: 409, code: 'ACCOUNT_VERSION_CONFLICT', details: { expectedVersion: 4, currentVersion: 5 },
    });
    noWrites(); expect(state).toEqual(afterFirst);
  });

  test.each(['item', 'product', 'version', 'audit', 'detail'])('rollback simulado ante error en %s', async (stage) => {
    const original = copy(state);
    const method = { item: itemUpdate, product: productUpdate, version: RestaurantAccount.increment, audit: AuditLog.create, detail: AccountItem.findAll }[stage];
    method.mockRejectedValueOnce(new Error(`fallo ${stage}`));
    await expect(change()).rejects.toThrow(`fallo ${stage}`);
    expect(transactions[0]).toMatchObject({ committed: false, rolledBack: true });
    expect(state).toEqual(original);
  });

  test('getAccount lee líneas y versión en la misma transacción con cuenta bloqueada', async () => {
    const detail = await getAccount(5);
    expect(detail).toMatchObject({ version: 4, accumulatedTotal: 16500 });
    expect(locks).toEqual([['account', 'UPDATE']]);
    expect(AccountItem.findAll.mock.calls[0][0].transaction).toBe(transactions[0]);
    expect(RestaurantAccount.findByPk.mock.calls.every(([, options]) => options.transaction === transactions[0])).toBe(true);
    noWrites();
  });
});

describe('HU-026 contrato HTTP', () => {
  const patch = (body, path = '/api/restaurant-accounts/5/items/11') => request(app).patch(path).send(body);

  test('200 detalle y 409 con versiones, sin modificar por segunda vez', async () => {
    const success = await patch({ quantity: 5, expectedVersion: 4, userId: 1 });
    expect(success.status).toBe(200);
    expect(success.body.data).toMatchObject({ version: 5, accumulatedTotal: 24500 });
    const stale = await patch({ quantity: 2, expectedVersion: 4 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'ACCOUNT_VERSION_CONFLICT', details: { expectedVersion: 4, currentVersion: 5 } });
    expect(state.items[0].quantity).toBe(5);
    expect(state.audits).toHaveLength(1);
  });

  test.each([
    {}, [], { quantity: 0, expectedVersion: 4 }, { quantity: -1, expectedVersion: 4 },
    { quantity: 1.5, expectedVersion: 4 }, { quantity: null, expectedVersion: 4 },
    { quantity: '', expectedVersion: 4 }, { quantity: '5', expectedVersion: 4 },
    { quantity: 100, expectedVersion: 4 }, { quantity: 5 },
    ...[0, -1, 1.5, null, '', '4', true].map((expectedVersion) => ({ quantity: 5, expectedVersion })),
    ...['unitPrice', 'productId', 'accountId', 'status', 'kitchenStatus', 'isRemoved'].map((key) => ({ quantity: 5, expectedVersion: 4, [key]: 1 })),
    { quantity: 5, expectedVersion: 4, userId: null },
  ])('422 para body inválido %p', async (body) => {
    const response = await patch(body);
    expect(response.status).toBe(422);
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(sequelize.transaction).not.toHaveBeenCalled(); noWrites();
  });

  test.each(['/0/items/11', '/abc/items/11', '/5/items/0', '/5/items/1.5', '/5/items/no'])('422 para identificadores %s', async (path) => {
    const response = await patch({ quantity: 5, expectedVersion: 4 }, `/api/restaurant-accounts${path}`);
    expect(response.status).toBe(422); noWrites();
  });

  test.each(['closed', 'cancelled'])('409 ACCOUNT_CLOSED para %s', async (status) => {
    state.account.status = status;
    const response = await patch({ quantity: 5, expectedVersion: 4 });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ACCOUNT_CLOSED'); noWrites();
  });

  test.each(['sent', 'preparing', 'served'])('409 para cocina %s', async (status) => {
    state.items[0].kitchenStatus = status;
    const response = await patch({ quantity: 5, expectedVersion: 4 });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ITEM_ALREADY_SENT'); noWrites();
  });
});
