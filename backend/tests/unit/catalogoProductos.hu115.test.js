'use strict';

jest.mock('../../src/models', () => ({ Product: { findAll: jest.fn() } }));
const { Op } = require('sequelize');
const request = require('supertest');
const app = require('../../src/app');
const { Product } = require('../../src/models');

beforeEach(() => jest.resetAllMocks());

describe('HU-115 búsqueda de productos', () => {
  test.each([
    ['Cas', 'Casado', 'Platos'],
    ['Beb', 'Refresco', 'Bebidas'],
  ])('CA-1 consulta nombre O categoría por coincidencia parcial: %s', async (q, name, category) => {
    Product.findAll.mockResolvedValue([{ productId: 1, name, category, price: '1500.50', stockQuantity: 8, isAvailable: false }]);
    const response = await request(app).get('/api/restaurant-products').query({ q: ` ${q} ` });
    expect(response.status).toBe(200);
    expect(Product.findAll).toHaveBeenCalledWith({
      where: { [Op.or]: [{ name: { [Op.like]: `%${q}%` } }, { category: { [Op.like]: `%${q}%` } }] },
      order: [['category', 'ASC'], ['name', 'ASC']],
    });
    expect(response.body.data).toEqual([expect.objectContaining({ name, category, price: 1500.5, stockQuantity: 8, status: 'No disponible' })]);
  });

  test('CA-2 responde lista vacía válida cuando no hay coincidencias', async () => {
    Product.findAll.mockResolvedValue([]);
    const response = await request(app).get('/api/restaurant-products').query({ q: 'inexistente' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { total: 0 } });
  });

  test('limpiar el criterio recupera la consulta completa de HU-114', async () => {
    Product.findAll.mockResolvedValue([]);
    await request(app).get('/api/restaurant-products').query({ q: '   ' }).expect(200);
    expect(Product.findAll).toHaveBeenCalledWith({ order: [['category', 'ASC'], ['name', 'ASC']] });
  });

  test('los comodines se buscan como texto literal', async () => {
    Product.findAll.mockResolvedValue([]);
    await request(app).get('/api/restaurant-products').query({ q: '50%_' }).expect(200);
    const filter = Product.findAll.mock.calls[0][0].where[Op.or];
    expect(filter[0].name[Op.like]).toBe('%50\\%\\_%');
    expect(filter[1].category[Op.like]).toBe('%50\\%\\_%');
  });

  test.each([{ q: 'a'.repeat(101) }, { q: ['a', 'b'] }, { 'q[name]': 'a' }])('rechaza criterio inválido %p', async (query) => {
    const response = await request(app).get('/api/restaurant-products').query(query);
    expect(response.status).toBe(422);
    expect(response.body.error.details).toBeInstanceOf(Array);
    expect(Product.findAll).not.toHaveBeenCalled();
  });
});
