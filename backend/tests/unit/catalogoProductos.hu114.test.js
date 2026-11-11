'use strict';

jest.mock('../../src/models', () => ({ Product: { findAll: jest.fn() } }));
const request = require('supertest');
const app = require('../../src/app');
const { Product } = require('../../src/models');

beforeEach(() => jest.resetAllMocks());

describe('HU-114 listado de productos del menú', () => {
  test('CA-1 incluye disponibles, agotados y desactivados con todos sus datos', async () => {
    const rows = [
      { productId: 1, name: 'Casado', category: 'Platos', price: '4500.50', stockQuantity: 8, isAvailable: true },
      { productId: 2, name: 'Pargo', category: 'Platos', price: '9000.00', stockQuantity: 0, isAvailable: false },
      { productId: 3, name: 'Sopa', category: null, price: '2000.00', stockQuantity: 5, isAvailable: false },
      { productId: 4, name: 'Refresco', category: 'Bebidas', price: '1500.00', stockQuantity: 0, isAvailable: true },
    ];
    Product.findAll.mockResolvedValue(rows.map((row) => ({ get: () => row })));
    const response = await request(app).get('/api/restaurant-products');
    expect(response.status).toBe(200);
    expect(Product.findAll).toHaveBeenCalledWith({ order: [['category', 'ASC'], ['name', 'ASC']] });
    expect(response.body.meta.total).toBe(4);
    expect(response.body.data.map((item) => item.status)).toEqual(['Disponible', 'Agotado', 'No disponible', 'Agotado']);
    expect(response.body.data[0]).toMatchObject({ productId: 1, name: 'Casado', category: 'Platos', price: 4500.5, stockQuantity: 8, isAvailable: true });
    expect(response.body.data[2]).toMatchObject({ productId: 3, category: null, stockQuantity: 5, isAvailable: false });
  });

  test('CA-2 responde lista vacía válida', async () => {
    Product.findAll.mockResolvedValue([]);
    const response = await request(app).get('/api/restaurant-products');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { total: 0 } });
  });

  test('un fallo de consulta no se presenta como catálogo vacío', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      Product.findAll.mockRejectedValue(new Error('Consulta fallida'));
      const response = await request(app).get('/api/restaurant-products');
      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Consulta fallida');
      expect(response.body.data).toBeUndefined();
    } finally { log.mockRestore(); }
  });
});
