import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-024 (Marvin, Sprint 4) - Abrir una cuenta al
// asignar una mesa.
//
// Unidad bajo prueba: openTableAccount() en cuentaApertura.service.js.
//   CA-1 Apertura exitosa                       -> aqui
//   CA-2 Dos meseros al mismo tiempo            -> aqui (carrera simulada)
//   CA-3 Mesa ya ocupada                        -> aqui
//
// Misma tecnica de require.cache que las demas pruebas Vitest. La carrera
// de CA-2 se simula con una transaccion falsa que SERIALIZA los callbacks,
// igual que el SELECT ... FOR UPDATE sobre la fila de la mesa en MySQL.
//
// Ejecutar: (desde backend/)  npx vitest run tests/unit/restaurantAccounts.openTableAccount.vitest.test.js --reporter=verbose

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  RestaurantTable: { findByPk: vi.fn() },
  RestaurantAccount: {
    findOne: vi.fn(), create: vi.fn(), findByPk: vi.fn(), increment: vi.fn(), findAll: vi.fn(),
  },
  AccountItem: { findAll: vi.fn(), create: vi.fn() },
  Product: { findAll: vi.fn(), findByPk: vi.fn() },
  Customer: {},
  AuditLog: { create: vi.fn() },
  User: { findByPk: vi.fn() },
  sequelize: { transaction: vi.fn() },
};

const modelsAbsolutePath = nodeRequire.resolve('../../src/models');
nodeRequire.cache[modelsAbsolutePath] = {
  id: modelsAbsolutePath,
  filename: modelsAbsolutePath,
  loaded: true,
  exports: mockModels,
};

const { openTableAccount } = nodeRequire('../../src/modules/restaurante/cuentaApertura.service');
const { MESSAGES, CODES } = nodeRequire('../../src/modules/restaurante/restaurante.util');

const {
  RestaurantTable, RestaurantAccount, AccountItem, AuditLog, User, sequelize,
} = mockModels;

const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };

async function catchError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error y la operacion termino bien.');
}

// Mesa con update() que muta la instancia, como hace Sequelize.
function fakeTable(overrides = {}) {
  return {
    tableId: 4,
    resourceId: 24,
    tableNumber: '4',
    seatCount: 6,
    location: 'Terraza',
    status: 'available',
    update: vi.fn(async function update(values) { Object.assign(this, values); return this; }),
    ...overrides,
  };
}

let table;
// Cuentas "guardadas" en la BD falsa (para la carrera de CA-2).
let accounts;

beforeEach(() => {
  vi.clearAllMocks();
  table = fakeTable();
  accounts = [];
  sequelize.transaction.mockImplementation(async (callback) => callback(fakeTransaction));
  User.findByPk.mockResolvedValue({ userId: 3, isActive: true });
  RestaurantTable.findByPk.mockImplementation(async () => table);
  RestaurantAccount.findOne.mockImplementation(async ({ where }) => (
    accounts.find((account) => account.tableId === where.tableId && account.status === where.status) ?? null
  ));
  RestaurantAccount.create.mockImplementation(async (data) => {
    const account = { accountId: 50 + accounts.length, version: 1, bookingId: null, customerId: null, ...data };
    accounts.push(account);
    return account;
  });
  RestaurantAccount.findByPk.mockImplementation(async (id) => accounts.find((account) => account.accountId === id) ?? null);
  AccountItem.findAll.mockResolvedValue([]); // cuenta recien abierta, sin lineas
  AuditLog.create.mockResolvedValue({ auditId: 1 });
});

describe('HU-024 - openTableAccount (abrir cuenta al asignar una mesa)', () => {
  it('CA-1 mesa disponible: crea la cuenta con mesero y hora de apertura, y la mesa pasa a "occupied"', async () => {
    const before = Date.now();
    const result = await openTableAccount({ tableId: 4, seenTableStatus: 'available', userId: 3 });

    expect(RestaurantAccount.create).toHaveBeenCalledTimes(1);
    const [created, options] = RestaurantAccount.create.mock.calls[0];
    expect(created).toMatchObject({ tableId: 4, openedByUserId: 3, status: 'open' });
    expect(created.openedAt).toBeInstanceOf(Date);
    expect(created.openedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(options).toEqual({ transaction: fakeTransaction });
    expect(table.update).toHaveBeenCalledWith({ status: 'occupied' }, { transaction: fakeTransaction });

    expect(result.table).toMatchObject({ tableId: 4, status: 'occupied', isOccupied: true, isActive: true });
    expect(result.account).toMatchObject({
      accountId: 50,
      status: 'open',
      version: 1,
      openedAt: created.openedAt,
      table: { tableId: 4, tableNumber: '4', seatCount: 6 },
      items: [],
      itemCount: 0,
      accumulatedTotal: 0,
    });
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 3, action: 'restaurant_account_opened', entityType: 'restaurant_account', entityId: 50,
    }), { transaction: fakeTransaction });
  });

  it('CA-1 / CA-2 la mesa y la cuenta abierta se leen con LOCK.UPDATE dentro de la transaccion', async () => {
    await openTableAccount({ tableId: 4, seenTableStatus: 'available', userId: 3 });
    expect(RestaurantTable.findByPk).toHaveBeenCalledWith(4, { transaction: fakeTransaction, lock: 'UPDATE' });
    expect(RestaurantAccount.findOne).toHaveBeenCalledWith({
      where: { tableId: 4, status: 'open' }, transaction: fakeTransaction, lock: 'UPDATE',
    });
  });

  it('CA-2 el mesero vio la mesa disponible pero ya tiene cuenta: 409 TABLE_ALREADY_OPENED con accountId', async () => {
    accounts.push({ accountId: 77, tableId: 4, status: 'open' });

    const error = await catchError(openTableAccount({ tableId: 4, seenTableStatus: 'available', userId: 3 }));

    expect(error).toMatchObject({
      statusCode: 409,
      code: CODES.TABLE_ALREADY_OPENED,
      details: { tableId: 4, accountId: 77 },
    });
    expect(error.message).toBe('Esta mesa ya fue abierta');
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
    expect(table.update).not.toHaveBeenCalled();
  });

  it('CA-2 carrera simulada: dos meseros a la vez -> UNA sola cuenta; el segundo recibe "Esta mesa ya fue abierta"', async () => {
    // Bloqueo de fila simulado: cada transaccion espera a que termine la
    // anterior, como SELECT ... FOR UPDATE sobre la misma mesa.
    let queue = Promise.resolve();
    sequelize.transaction.mockImplementation((callback) => {
      const run = queue.then(() => callback(fakeTransaction));
      queue = run.catch(() => {});
      return run;
    });

    const results = await Promise.allSettled([
      openTableAccount({ tableId: 4, seenTableStatus: 'available', userId: 3 }),
      openTableAccount({ tableId: 4, seenTableStatus: 'available', userId: 5 }),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(RestaurantAccount.create).toHaveBeenCalledTimes(1);
    expect(accounts).toHaveLength(1);
    expect(results[1].reason).toMatchObject({
      statusCode: 409, code: CODES.TABLE_ALREADY_OPENED, message: MESSAGES.TABLE_ALREADY_OPENED,
      details: { accountId: accounts[0].accountId },
    });
  });

  it('CA-3 la mesa ya se veia ocupada: 409 TABLE_OCCUPIED con la cuenta abierta para unir el pedido', async () => {
    table = fakeTable({ status: 'occupied' });
    accounts.push({ accountId: 81, tableId: 4, status: 'open' });

    const error = await catchError(openTableAccount({ tableId: 4, seenTableStatus: 'occupied', userId: 3 }));

    expect(error).toMatchObject({
      statusCode: 409, code: CODES.TABLE_OCCUPIED, details: { tableId: 4, accountId: 81 },
    });
    expect(error.message).toBe('La mesa ya se encuentra ocupada');
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
  });

  it('CA-3 sin seenTableStatus se responde como mesa ocupada', async () => {
    accounts.push({ accountId: 81, tableId: 4, status: 'open' });
    const error = await catchError(openTableAccount({ tableId: 4, userId: 3 }));
    expect(error.code).toBe(CODES.TABLE_OCCUPIED);
  });

  it('fuente de verdad: status "occupied" sin cuenta abierta (desincronizado) permite abrir', async () => {
    table = fakeTable({ status: 'occupied' });
    const result = await openTableAccount({ tableId: 4, seenTableStatus: 'occupied', userId: 3 });
    expect(RestaurantAccount.create).toHaveBeenCalledTimes(1);
    expect(result.table.status).toBe('occupied');
  });

  it('una cuenta cerrada anterior no impide abrir una nueva', async () => {
    accounts.push({ accountId: 60, tableId: 4, status: 'closed' });
    await openTableAccount({ tableId: 4, seenTableStatus: 'available', userId: 3 });
    expect(RestaurantAccount.create).toHaveBeenCalledTimes(1);
  });

  it('mesa inactiva: 409 TABLE_INACTIVE', async () => {
    table = fakeTable({ status: 'inactive' });
    const error = await catchError(openTableAccount({ tableId: 4, seenTableStatus: 'available', userId: 3 }));
    expect(error).toMatchObject({ statusCode: 409, code: CODES.TABLE_INACTIVE });
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
  });

  it('mesa inexistente: 404', async () => {
    table = null;
    const error = await catchError(openTableAccount({ tableId: 99, userId: 3 }));
    expect(error).toMatchObject({ statusCode: 404, message: MESSAGES.TABLE_NOT_FOUND });
  });

  it('sin usuario responsable: 422 y no abre nada', async () => {
    const error = await catchError(openTableAccount({ tableId: 4, seenTableStatus: 'available' }));
    expect(error).toMatchObject({ statusCode: 422, code: CODES.ACTING_USER_INVALID, details: [{ field: 'userId' }] });
    expect(RestaurantTable.findByPk).not.toHaveBeenCalled();
  });

  it('usuario inexistente o inactivo: 422 ACTING_USER_INVALID', async () => {
    User.findByPk.mockResolvedValue({ userId: 3, isActive: false });
    const error = await catchError(openTableAccount({ tableId: 4, userId: 3 }));
    expect(error).toMatchObject({ statusCode: 422, code: CODES.ACTING_USER_INVALID });
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
  });

  it.each([0, -1, '4', 2.5, undefined])('tableId invalido (%s): 422 sin abrir transaccion', async (tableId) => {
    const error = await catchError(openTableAccount({ tableId, userId: 3 }));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'tableId' }] });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('seenTableStatus desconocido: 422', async () => {
    const error = await catchError(openTableAccount({ tableId: 4, seenTableStatus: 'free', userId: 3 }));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'seenTableStatus' }] });
  });
});
