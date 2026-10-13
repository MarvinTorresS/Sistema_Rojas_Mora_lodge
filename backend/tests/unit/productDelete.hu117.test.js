'use strict';
jest.mock('../../src/models', () => ({
  Product: { findByPk: jest.fn() }, AccountItem: { count: jest.fn() }, AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const app = require('../../src/app');
const { Product, AccountItem, AuditLog, sequelize } = require('../../src/models');
const { deleteProduct } = require('../../src/modules/restaurante/productDelete.service');
let product;
beforeEach(() => {
  jest.resetAllMocks();
  sequelize.transaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  product = { productId: 1, name: 'Bebida', category: 'Bebidas', price: '1500.00', stockQuantity: 10, isAvailable: true, destroy: jest.fn() };
  Product.findByPk.mockResolvedValue(product); AccountItem.count.mockResolvedValue(0);
});
test('CA-1 elimina un producto sin pedidos y audita sus datos anteriores', async () => {
  expect(await deleteProduct({ productId: 1, userId: 8 })).toEqual({ productId: 1, message: 'Producto eliminado exitosamente' });
  const [entry, options] = AuditLog.create.mock.calls[0];
  expect(entry).toMatchObject({ action: 'restaurant_product_deleted', entityId: 1, userId: 8 });
  expect(JSON.parse(entry.details).previousProduct).toMatchObject({ name: 'Bebida', price: 1500 });
  expect(options.transaction).toBe(product.destroy.mock.calls[0][0].transaction);
});
test('CA-2 cualquier pedido asociado bloquea, incluidos consumos retirados', async () => {
  AccountItem.count.mockResolvedValue(1);
  await expect(deleteProduct({ productId: 1 })).rejects.toMatchObject({ statusCode: 409, code: 'PRODUCT_HAS_HISTORY' });
  expect(AccountItem.count.mock.calls[0][0].where).toEqual({ productId: 1 });
  expect(product.destroy).not.toHaveBeenCalled(); expect(AuditLog.create).not.toHaveBeenCalled();
});
test('si la FK detecta una referencia concurrente, se informa historial', async () => {
  product.destroy.mockRejectedValue(Object.assign(new Error('SQL'), { name: 'SequelizeForeignKeyConstraintError' }));
  await expect(deleteProduct({ productId: 1 })).rejects.toMatchObject({ statusCode: 409, code: 'PRODUCT_HAS_HISTORY' });
  expect(AuditLog.create).not.toHaveBeenCalled();
});
test('producto inexistente devuelve 404', async () => {
  Product.findByPk.mockResolvedValue(null);
  await expect(deleteProduct({ productId: 999 })).rejects.toMatchObject({ statusCode: 404 });
  expect(AccountItem.count).not.toHaveBeenCalled();
});
test('fallo de auditoria rechaza la transaccion', async () => {
  AuditLog.create.mockRejectedValue(new Error('Auditoria no disponible'));
  await expect(deleteProduct({ productId: 1 })).rejects.toThrow('Auditoria no disponible');
});
test.each([undefined, false, 'true'])('API exige confirmacion explicita %s', async (confirmed) => {
  expect((await request(app).delete('/api/restaurant-products/1').send({ confirmed })).status).toBe(422);
  expect(Product.findByPk).not.toHaveBeenCalled();
});
test('API valida el identificador y acepta eliminacion confirmada', async () => {
  expect((await request(app).delete('/api/restaurant-products/abc').send({ confirmed: true })).status).toBe(422);
  expect((await request(app).delete('/api/restaurant-products/1').send({ confirmed: true })).body.data.message).toBe('Producto eliminado exitosamente');
});
