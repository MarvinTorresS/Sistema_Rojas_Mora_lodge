'use strict';

jest.mock('../../src/models', () => ({
  RestaurantTable: { findByPk: jest.fn() }, Resource: { findByPk: jest.fn() },
  RestaurantAccount: { findOne: jest.fn() }, Booking: { findOne: jest.fn() },
  ResourceBlock: { findOne: jest.fn() }, CabinDetail: { findOne: jest.fn() },
  EventHallPricingPlan: { findOne: jest.fn() }, FieldRate: { findOne: jest.fn() },
  User: { findOne: jest.fn() }, Role: {}, AuditLog: { create: jest.fn() }, sequelize: { transaction: jest.fn() },
}));
const bcrypt = require('bcrypt');
const request = require('supertest');
const models = require('../../src/models');
const app = require('../../src/app');
const { deleteTable, deactivateTable } = require('../../src/modules/restaurante/catalogoMesas.service');
const { createTableDeletionThrottle } = require('../../src/modules/restaurante/tableDeletionThrottle.middleware');

const adminApproval = { email: 'admin@example.com', password: 'Password-test-105' };
const copy = (value) => JSON.parse(JSON.stringify(value));
let state; let user; let passwordHash; let tx; let locks; let clock = 0;
const tableDestroy = jest.fn(); const resourceDestroy = jest.fn();
const tableUpdate = jest.fn(); const resourceUpdate = jest.fn();
const remove = (options = {}) => deleteTable(1, { confirmed: true, adminApproval, ...options });
const inTx = (options) => { expect(options.transaction).toBe(tx); return tx.data; };
const unchanged = (before) => {
  expect(state).toEqual(before);
  expect(tableDestroy).not.toHaveBeenCalled();
  expect(resourceDestroy).not.toHaveBeenCalled();
  expect(models.AuditLog.create).not.toHaveBeenCalled();
};

beforeAll(async () => { passwordHash = await bcrypt.hash(adminApproval.password, 10); });
beforeEach(() => {
  jest.restoreAllMocks(); jest.resetAllMocks();
  clock += 16 * 60 * 1000;
  jest.spyOn(Date, 'now').mockReturnValue(clock);
  locks = [];
  state = {
    table: { tableId: 1, resourceId: 21, tableNumber: 'A1', seatCount: 4, status: 'available' },
    resource: { resourceId: 21, resourceType: 'restaurant_table', status: 'available' },
    RestaurantAccount: [], Booking: [], ResourceBlock: [], CabinDetail: [], EventHallPricingPlan: [], FieldRate: [],
    consumptions: [{ accountId: 99, quantity: 2 }], invoices: [{ invoiceId: 99 }], audits: [],
  };
  user = { userId: 7, isActive: true, passwordHash, role: { roleName: 'Administrador' } };
  models.User.findOne.mockImplementation(async () => user);
  // Simulación de atomicidad; no demuestra locks ni rollback reales de MySQL.
  models.sequelize.transaction.mockImplementation(async (callback) => {
    tx = { LOCK: { UPDATE: 'UPDATE' }, data: copy(state), committed: false, rolledBack: false };
    try {
      const result = await callback(tx);
      state = copy(tx.data); tx.committed = true; return result;
    } catch (error) { tx.rolledBack = true; throw error; }
  });
  models.RestaurantTable.findByPk.mockImplementation(async (id, options) => {
    if (options.lock) locks.push('table');
    const row = inTx(options).table;
    return row ? { ...row, destroy: tableDestroy, update: tableUpdate } : null;
  });
  models.Resource.findByPk.mockImplementation(async (id, options) => {
    expect(options.lock).toBe('UPDATE'); locks.push('resource');
    const row = inTx(options).resource;
    return row ? { ...row, destroy: resourceDestroy, update: resourceUpdate } : null;
  });
  for (const name of ['RestaurantAccount', 'Booking', 'ResourceBlock', 'CabinDetail', 'EventHallPricingPlan', 'FieldRate']) {
    models[name].findOne.mockImplementation(async (options) => {
      expect(options.lock).toBe('UPDATE');
      return inTx(options)[name].find((row) => Object.entries(options.where).every(([key, value]) => row[key] === value)) ?? null;
    });
  }
  tableDestroy.mockImplementation(async (options) => { inTx(options).table = null; });
  resourceDestroy.mockImplementation(async (options) => { expect(inTx(options).table).toBeNull(); inTx(options).resource = null; });
  tableUpdate.mockImplementation(async (values, options) => Object.assign(inTx(options).table, values));
  resourceUpdate.mockImplementation(async (values, options) => Object.assign(inTx(options).resource, values));
  models.AuditLog.create.mockImplementation(async (values, options) => inTx(options).audits.push(values));
});
afterEach(() => jest.restoreAllMocks());

describe('HU-105 eliminación y preservación de historial', () => {
  test('CA-1 elimina mesa y recurso, en orden, y audita la identidad verificada sin credenciales', async () => {
    const original = copy(state);
    const result = await remove();
    expect(result).toEqual({ tableId: 1, resourceId: 21, tableNumber: 'A1', seatCount: 4 });
    expect(state.table).toBeNull(); expect(state.resource).toBeNull();
    expect(locks).toEqual(['resource', 'table']);
    expect(tx.committed).toBe(true);
    expect(state.consumptions).toEqual(original.consumptions); expect(state.invoices).toEqual(original.invoices);
    expect(state.audits).toEqual([expect.objectContaining({ userId: 7, action: 'restaurant_table_deleted', entityId: 1 })]);
    expect(JSON.parse(state.audits[0].details)).toEqual(result);
    expect(JSON.stringify(state.audits)).not.toContain(adminApproval.password);
    expect(models.User.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email: adminApproval.email, isActive: true } }));
  });

  test('mesa inexistente responde 404', async () => {
    state.table = null; const original = copy(state);
    await expect(remove()).rejects.toMatchObject({ statusCode: 404 }); unchanged(original);
  });
  test.each(['cabin', 'field', 'event_hall'])('rechaza recurso tipo %s', async (resourceType) => {
    state.resource.resourceType = resourceType; const original = copy(state);
    await expect(remove()).rejects.toMatchObject({ statusCode: 409, code: 'TABLE_RESOURCE_INVALID' }); unchanged(original);
  });
  test('rechaza recurso ausente', async () => {
    state.resource = null; const original = copy(state);
    await expect(remove()).rejects.toMatchObject({ code: 'TABLE_RESOURCE_INVALID' }); unchanged(original);
  });
  test.each(['open', 'closed', 'cancelled'])('CA-2 rechaza cuenta %s incluso sin consumos', async (status) => {
    state.RestaurantAccount.push({ accountId: 1, tableId: 1, status }); const original = copy(state);
    await expect(remove()).rejects.toMatchObject({ statusCode: 409, code: 'TABLE_HAS_HISTORY', details: { alternative: 'deactivate' } });
    expect(models.RestaurantAccount.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { tableId: 1 } }));
    unchanged(original); expect(tableUpdate).not.toHaveBeenCalled(); expect(resourceUpdate).not.toHaveBeenCalled();
  });
  test.each([
    ['Booking', { status: 'cancelled' }], ['Booking', { status: 'active' }],
    ['ResourceBlock', { isActive: false }], ['ResourceBlock', { isActive: true }],
    ['CabinDetail', {}], ['EventHallPricingPlan', {}], ['FieldRate', {}],
  ])('rechaza referencia %s %p', async (name, fields) => {
    state[name].push({ resourceId: 21, ...fields }); const original = copy(state);
    await expect(remove()).rejects.toMatchObject({ statusCode: 409, code: 'TABLE_HAS_HISTORY' }); unchanged(original);
  });
  test.each(['table', 'resource', 'audit'])('rollback simulado ante fallo de %s', async (stage) => {
    const original = copy(state);
    ({ table: tableDestroy, resource: resourceDestroy, audit: models.AuditLog.create })[stage].mockRejectedValueOnce(new Error('Fallo de escritura'));
    await expect(remove()).rejects.toThrow('Fallo de escritura');
    expect(tx).toMatchObject({ rolledBack: true, committed: false }); expect(state).toEqual(original);
  });
  test('una FK no prevista revierte el borrado parcial y responde 409', async () => {
    const original = copy(state);
    resourceDestroy.mockRejectedValueOnce(Object.assign(new Error('FK'), { name: 'SequelizeForeignKeyConstraintError' }));
    await expect(remove()).rejects.toMatchObject({ statusCode: 409, code: 'TABLE_HAS_HISTORY' });
    expect(tx.rolledBack).toBe(true); expect(state).toEqual(original); expect(models.AuditLog.create).not.toHaveBeenCalled();
  });
});

describe('HU-105 autorización real por operación', () => {
  test.each(['Mesero', 'Recepcionista'])('rechaza rol %s con contraseña correcta', async (roleName) => {
    user.role.roleName = roleName;
    await expect(remove()).rejects.toMatchObject({ statusCode: 403 });
    expect(models.sequelize.transaction).not.toHaveBeenCalled();
  });
  test('rechaza usuario inactivo aunque la contraseña coincida', async () => {
    user.isActive = false;
    await expect(remove()).rejects.toMatchObject({ statusCode: 401 }); expect(models.sequelize.transaction).not.toHaveBeenCalled();
  });
  test('rechaza contraseña incorrecta mediante bcrypt real', async () => {
    await expect(remove({ adminApproval: { ...adminApproval, password: 'incorrecta' } })).rejects.toMatchObject({ statusCode: 401 });
    expect(models.sequelize.transaction).not.toHaveBeenCalled();
  });
  test('rechaza usuario inexistente', async () => {
    user = null;
    await expect(remove()).rejects.toMatchObject({ statusCode: 401 }); expect(models.sequelize.transaction).not.toHaveBeenCalled();
  });
  test('no permite ausencia de credenciales', async () => {
    await expect(remove({ adminApproval: undefined })).rejects.toMatchObject({ statusCode: 422 });
    expect(models.sequelize.transaction).not.toHaveBeenCalled();
  });
  test('DELETE retorna 200 sin confiar en userId o role declarados', async () => {
    const response = await request(app).delete('/api/restaurant-tables/1').send({ confirmed: true, adminApproval, userId: 900, role: 'Administrador' });
    expect(response.status).toBe(200); expect(state.audits[0].userId).toBe(7);
  });
  test.each(['0', 'abc', '-1'])('identificador %s responde 422 antes de autenticar', async (id) => {
    const response = await request(app).delete(`/api/restaurant-tables/${id}`).send({ confirmed: true, adminApproval });
    expect(response.status).toBe(422); expect(models.User.findOne).not.toHaveBeenCalled();
  });
  test('requiere confirmación y no filtra contraseña en validaciones', async () => {
    const response = await request(app).delete('/api/restaurant-tables/1').send({ adminApproval });
    expect(response.status).toBe(422); expect(JSON.stringify(response.body)).not.toContain(adminApproval.password);
    expect(models.User.findOne).not.toHaveBeenCalled();
  });
  test('DELETE con historial retorna alternativa sin desactivar', async () => {
    state.Booking.push({ resourceId: 21 });
    const response = await request(app).delete('/api/restaurant-tables/1').send({ confirmed: true, adminApproval });
    expect(response.status).toBe(409); expect(response.body.error.details.alternative).toBe('deactivate');
    expect(state.table.status).toBe('available'); expect(state.resource.status).toBe('available');
  });
  test('limita intentos incluso sin credenciales y libera la ventana tras 15 minutos', () => {
    const middleware = createTableDeletionThrottle();
    const next = jest.fn();
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    for (let i = 0; i < 6; i += 1) middleware({ ip: '127.0.0.1', body: {} }, res, next);
    expect(next).toHaveBeenCalledTimes(5); expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '900');
    Date.now.mockReturnValue(clock + 16 * 60 * 1000);
    middleware({ ip: '127.0.0.1' }, res, next); expect(next).toHaveBeenCalledTimes(6);
  });
});

describe('HU-106 compatibilidad: mesa y recurso', () => {
  test('desactiva ambos registros sin borrar historial', async () => {
    state.RestaurantAccount.push({ tableId: 1, status: 'closed' }); const original = copy(state);
    await deactivateTable(1, { confirmed: true, userId: 7 });
    expect(state.table.status).toBe('inactive'); expect(state.resource.status).toBe('inactive');
    expect(state.RestaurantAccount).toEqual(original.RestaurantAccount); expect(state.consumptions).toEqual(original.consumptions);
    expect(tableDestroy).not.toHaveBeenCalled(); expect(resourceDestroy).not.toHaveBeenCalled();
  });
  test('cuenta abierta impide desactivar ambos', async () => {
    state.RestaurantAccount.push({ tableId: 1, status: 'open' }); const original = copy(state);
    await expect(deactivateTable(1, { confirmed: true })).rejects.toMatchObject({ code: 'TABLE_HAS_OPEN_ACCOUNT' });
    expect(state).toEqual(original); expect(tableUpdate).not.toHaveBeenCalled(); expect(resourceUpdate).not.toHaveBeenCalled();
  });
  test('fallo actualizando recurso revierte la desactivación de mesa', async () => {
    const original = copy(state); resourceUpdate.mockRejectedValueOnce(new Error('Fallo recurso'));
    await expect(deactivateTable(1, { confirmed: true })).rejects.toThrow('Fallo recurso');
    expect(tx.rolledBack).toBe(true); expect(state).toEqual(original);
  });
});
