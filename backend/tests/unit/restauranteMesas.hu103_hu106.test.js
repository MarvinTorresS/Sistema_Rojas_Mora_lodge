'use strict';

// HU-103 (listado de mesas) y HU-106 (desactivar una mesa) - Sprint 4, Alison.
jest.mock('../../src/models', () => ({
  RestaurantTable: { findAll: jest.fn(), findByPk: jest.fn() },
  RestaurantAccount: { findOne: jest.fn() },
  AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn() },
}));
const request = require('supertest');
const app = require('../../src/app');
const {
  RestaurantTable, RestaurantAccount, AuditLog, sequelize,
} = require('../../src/models');
const { listTables, deactivateTable } = require('../../src/modules/restaurante/catalogoMesas.service');
const { compareTableNumbers } = require('../../src/modules/restaurante/restaurante.util');

const table = (overrides = {}) => ({
  tableId: 1, tableNumber: '1', seatCount: 4, status: 'available',
  update: jest.fn(async function update(values) { Object.assign(this, values); return this; }),
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  sequelize.transaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
});

describe('HU-103 - Consultar el listado de mesas', () => {
  test('CA-1 muestra numero, capacidad, ubicacion y estado, ordenado por numero ascendente', async () => {
    RestaurantTable.findAll.mockResolvedValue([
      table({ tableId: 3, tableNumber: '10', seatCount: 6 }),
      table({ tableId: 1, tableNumber: '2', seatCount: 4 }),
      table({ tableId: 2, tableNumber: '1', seatCount: 2, status: 'inactive' }),
    ]);
    const result = await listTables();
    // "10" va DESPUES de "2": orden numerico, no alfabetico.
    expect(result.items.map((item) => item.tableNumber)).toEqual(['1', '2', '10']);
    expect(result.items[0]).toMatchObject({
      tableNumber: '1', seatCount: 2, location: null, stateLabel: 'Inactiva', isActive: false,
    });
    expect(result.items[1]).toMatchObject({ stateLabel: 'Activa', isActive: true });
  });

  test('la capacidad total instalada suma solo las mesas activas', async () => {
    RestaurantTable.findAll.mockResolvedValue([
      table({ tableNumber: '1', seatCount: 4 }),
      table({ tableNumber: '2', seatCount: 6, status: 'occupied' }),
      table({ tableNumber: '3', seatCount: 8, status: 'inactive' }),
    ]);
    const result = await listTables();
    expect(result).toMatchObject({ total: 3, activeTotal: 2, inactiveTotal: 1, totalCapacity: 10 });
  });

  test('una mesa ocupada sigue siendo Activa (HU-103 solo distingue Activa/Inactiva)', async () => {
    RestaurantTable.findAll.mockResolvedValue([table({ status: 'occupied' })]);
    const [item] = (await listTables()).items;
    expect(item.stateLabel).toBe('Activa');
    expect(item.isOccupied).toBe(true);
  });

  test('CA-2 sin mesas devuelve una lista vacia (no es un error)', async () => {
    RestaurantTable.findAll.mockResolvedValue([]);
    expect(await listTables()).toEqual({
      items: [], total: 0, activeTotal: 0, inactiveTotal: 0, totalCapacity: 0,
    });
  });

  test('el endpoint responde { data, meta }', async () => {
    RestaurantTable.findAll.mockResolvedValue([table({ tableNumber: '5' })]);
    const response = await request(app).get('/api/restaurant-tables');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ total: 1, totalCapacity: 4 });
  });

  test('orden natural de numeros de mesa', () => {
    expect(['10', '2', '1'].sort(compareTableNumbers)).toEqual(['1', '2', '10']);
    expect(['A10', 'A2', 'A1'].sort(compareTableNumbers)).toEqual(['A1', 'A2', 'A10']);
  });
});

describe('HU-106 - Desactivar una mesa', () => {
  test('CA-1 mesa activa sin cuenta abierta: queda Inactiva y se audita', async () => {
    const active = table();
    RestaurantTable.findByPk.mockResolvedValue(active);
    RestaurantAccount.findOne.mockResolvedValue(null);
    const result = await deactivateTable(1, { confirmed: true, userId: 7 });
    expect(active.update).toHaveBeenCalledWith({ status: 'inactive' }, expect.any(Object));
    expect(result).toMatchObject({ status: 'inactive', stateLabel: 'Inactiva', isActive: false });
    const [entry] = AuditLog.create.mock.calls[0];
    expect(entry).toMatchObject({ userId: 7, action: 'restaurant_table_deactivated', entityId: 1 });
  });

  test('bloquea la mesa dentro de la transaccion y busca cuentas ABIERTAS de esa mesa', async () => {
    RestaurantTable.findByPk.mockResolvedValue(table());
    RestaurantAccount.findOne.mockResolvedValue(null);
    await deactivateTable(1, { confirmed: true });
    expect(RestaurantTable.findByPk).toHaveBeenCalledWith(1, expect.objectContaining({ lock: 'UPDATE' }));
    expect(RestaurantAccount.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { tableId: 1, status: 'open' } }));
  });

  test('sin confirmacion no consulta ni cambia nada', async () => {
    await expect(deactivateTable(1, {})).rejects.toMatchObject({ statusCode: 422, message: 'Debe confirmar la desactivación de la mesa.' });
    await expect(deactivateTable(1, { confirmed: 'true' })).rejects.toMatchObject({ statusCode: 422 });
    expect(RestaurantTable.findByPk).not.toHaveBeenCalled();
  });

  test('CA-2 mesa con cuenta abierta: no se desactiva', async () => {
    const busy = table({ status: 'occupied' });
    RestaurantTable.findByPk.mockResolvedValue(busy);
    RestaurantAccount.findOne.mockResolvedValue({ accountId: 9 });
    await expect(deactivateTable(1, { confirmed: true })).rejects.toMatchObject({
      statusCode: 409,
      code: 'TABLE_HAS_OPEN_ACCOUNT',
      message: 'No es posible desactivar una mesa con cuenta abierta',
    });
    expect(busy.update).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('CA-2 el estado "ocupada" sin cuenta abierta NO bloquea (la fuente de verdad es la cuenta)', async () => {
    const stale = table({ status: 'occupied' });
    RestaurantTable.findByPk.mockResolvedValue(stale);
    RestaurantAccount.findOne.mockResolvedValue(null);
    await expect(deactivateTable(1, { confirmed: true })).resolves.toMatchObject({ status: 'inactive' });
  });

  test('CA-3 mesa ya inactiva: no cambia nada', async () => {
    const inactive = table({ status: 'inactive' });
    RestaurantTable.findByPk.mockResolvedValue(inactive);
    await expect(deactivateTable(1, { confirmed: true })).rejects.toMatchObject({
      statusCode: 409,
      code: 'TABLE_ALREADY_INACTIVE',
      message: 'La mesa ya se encuentra inactiva',
    });
    expect(inactive.update).not.toHaveBeenCalled();
    expect(RestaurantAccount.findOne).not.toHaveBeenCalled();
  });

  test('mesa inexistente: 404', async () => {
    RestaurantTable.findByPk.mockResolvedValue(null);
    await expect(deactivateTable(99, { confirmed: true })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('si la auditoria falla, la transaccion se rechaza', async () => {
    RestaurantTable.findByPk.mockResolvedValue(table());
    RestaurantAccount.findOne.mockResolvedValue(null);
    AuditLog.create.mockRejectedValue(new Error('Auditoria no disponible'));
    await expect(deactivateTable(1, { confirmed: true })).rejects.toThrow('Auditoria no disponible');
  });

  test('endpoint: id invalido o sin confirmar responde 422 sin consultar datos', async () => {
    const badId = await request(app).post('/api/restaurant-tables/abc/deactivate').send({ confirmed: true });
    expect(badId.status).toBe(422);
    const noConfirm = await request(app).post('/api/restaurant-tables/1/deactivate').send({});
    expect(noConfirm.status).toBe(422);
    expect(noConfirm.body.error.message).toBe('Debe confirmar la desactivación de la mesa.');
    expect(RestaurantTable.findByPk).not.toHaveBeenCalled();
  });

  test('endpoint: 409 trae el code para que la pantalla reaccione', async () => {
    RestaurantTable.findByPk.mockResolvedValue(table({ status: 'inactive' }));
    const response = await request(app).post('/api/restaurant-tables/1/deactivate').send({ confirmed: true });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'TABLE_ALREADY_INACTIVE', message: 'La mesa ya se encuentra inactiva' });
  });

  test('endpoint: desactivacion exitosa', async () => {
    RestaurantTable.findByPk.mockResolvedValue(table());
    RestaurantAccount.findOne.mockResolvedValue(null);
    const response = await request(app).post('/api/restaurant-tables/1/deactivate').send({ confirmed: true });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'inactive', stateLabel: 'Inactiva' });
  });
});
