'use strict';
jest.mock('../../src/models', () => ({
  Product: { findByPk: jest.fn() }, AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const app = require('../../src/app');
const { Product, AuditLog, sequelize } = require('../../src/models');
const { editProduct } = require('../../src/modules/restaurante/productEdit.service');
const payload = { name: 'Bebida Prueba', category: 'Bebidas', price: '2000.50', stockQuantity: 10 };
let product;
beforeEach(() => {
  jest.resetAllMocks();
  sequelize.transaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  product = { productId: 1, name: 'Bebida', category: 'Bebidas', price: '1500.00', stockQuantity: 0, isAvailable: false };
  product.update = jest.fn(async (data) => Object.assign(product, data));
  Product.findByPk.mockResolvedValue(product);
});
test('CA-1 guarda nombre categoria precio existencias y audita valores anteriores y nuevos', async () => {
  const result = await editProduct({ productId: 1, changes: payload, userId: 8 });
  expect(result.message).toBe('Producto actualizado exitosamente');
  expect(result.product).toMatchObject({ name: payload.name, category: payload.category, price: 2000.5, stockQuantity: 10 });
  const [entry, options] = AuditLog.create.mock.calls[0];
  expect(entry).toMatchObject({ userId: 8, action: 'restaurant_product_updated', entityId: 1 });
  expect(JSON.parse(entry.details)).toMatchObject({ previousProduct: { price: 1500 }, newProduct: { price: 2000.5 } });
  expect(options.transaction).toBe(product.update.mock.calls[0][1].transaction);
});
test('CA-2 reponer existencias reactiva automaticamente', async () => {
  expect((await editProduct({ productId: 1, changes: payload })).product.isAvailable).toBe(true);
});
test('CA-3 cero existencias marca agotado', async () => {
  expect((await editProduct({ productId: 1, changes: { ...payload, stockQuantity: 0 } })).product.isAvailable).toBe(false);
});
test.each(['name', 'category', 'price'])('CA-4 campo obligatorio %s incompleto no guarda', async (field) => {
  const response = await request(app).put('/api/restaurant-products/1').send({ ...payload, [field]: '' });
  expect(response.status).toBe(422);
  expect(response.body.error.message).toBe('Los campos marcados con (*) son obligatorios');
  expect(response.body.error.details.some((detail) => detail.field === field)).toBe(true);
  expect(product.update).not.toHaveBeenCalled();
});
test.each([-1, 0, 'abc', '1.005', '100000000.00'])('rechaza precio %s', async (price) => {
  expect((await request(app).put('/api/restaurant-products/1').send({ ...payload, price })).status).toBe(422);
  expect(product.update).not.toHaveBeenCalled();
});
test.each([-1, 1.5])('rechaza existencias %s', async (stockQuantity) => {
  expect((await request(app).put('/api/restaurant-products/1').send({ ...payload, stockQuantity })).status).toBe(422);
});
test('producto inexistente responde 404', async () => {
  Product.findByPk.mockResolvedValue(null);
  expect((await request(app).get('/api/restaurant-products/999')).status).toBe(404);
});
test('nombre duplicado por categoria se informa sin exponer el error SQL', async () => {
  product.update.mockRejectedValue(Object.assign(new Error('SQL'), { name: 'SequelizeUniqueConstraintError' }));
  await expect(editProduct({ productId: 1, changes: payload })).rejects.toMatchObject({ statusCode: 409, message: 'Ya existe un producto con ese nombre en la misma categoría.' });
  expect(AuditLog.create).not.toHaveBeenCalled();
});
test('fallo de auditoria rechaza la transaccion', async () => {
  AuditLog.create.mockRejectedValue(new Error('Sin auditoria'));
  await expect(editProduct({ productId: 1, changes: payload })).rejects.toThrow('Sin auditoria');
});
