import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-102 (Marvin, Sprint 4) - Registrar una nueva mesa.
//
// Unidad bajo prueba: createTable() en catalogoMesas.service.js.
//   CA-1 Registro exitoso            -> se prueba aqui (service)
//   CA-2 Numero duplicado            -> se prueba aqui (service)
//   CA-3 Campos obligatorios         -> se prueba aqui (service)
//   CA-4 Cancelacion                 -> solo frontend (no aplica)
//
// Misma tecnica que las pruebas de HU-001/HU-016: el service usa
// require('../../models') (CommonJS), que vi.mock() no intercepta. Se
// pre-puebla require.cache con el mock ANTES de requerir el service.
//
// Ejecutar: (desde backend/)  npx vitest run tests/unit/restaurantTables.createTable.vitest.test.js --reporter=verbose

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  RestaurantTable: { findOne: vi.fn(), findAll: vi.fn(), findByPk: vi.fn(), create: vi.fn() },
  RestaurantAccount: { findOne: vi.fn() },
  Resource: { create: vi.fn(), findByPk: vi.fn() },
  Booking: { findOne: vi.fn() },
  ResourceBlock: { findOne: vi.fn() },
  CabinDetail: { findOne: vi.fn() },
  EventHallPricingPlan: { findOne: vi.fn() },
  FieldRate: { findOne: vi.fn() },
  AuditLog: { create: vi.fn() },
  User: { findByPk: vi.fn(), findOne: vi.fn() },
  Role: { findByPk: vi.fn() },
  sequelize: { transaction: vi.fn() },
};

const modelsAbsolutePath = nodeRequire.resolve('../../src/models');
nodeRequire.cache[modelsAbsolutePath] = {
  id: modelsAbsolutePath,
  filename: modelsAbsolutePath,
  loaded: true,
  exports: mockModels,
};

const { createTable } = nodeRequire('../../src/modules/restaurante/catalogoMesas.service');
const { MESSAGES, CODES } = nodeRequire('../../src/modules/restaurante/restaurante.util');

const {
  RestaurantTable, Resource, AuditLog, User, sequelize,
} = mockModels;

const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };

// Error con la forma que lanza Sequelize al violar un indice UNIQUE.
function uniqueConstraintError() {
  const error = new Error('Validation error');
  error.name = 'SequelizeUniqueConstraintError';
  return error;
}

// Ejecuta la promesa y devuelve el error (o falla si no lanzo).
async function catchError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error y la operacion termino bien.');
}

beforeEach(() => {
  vi.clearAllMocks();
  sequelize.transaction.mockImplementation(async (callback) => callback(fakeTransaction));
  RestaurantTable.findOne.mockResolvedValue(null); // numero libre
  Resource.create.mockImplementation(async (data) => ({ resourceId: 40, ...data }));
  RestaurantTable.create.mockImplementation(async (data) => ({ tableId: 12, ...data }));
  AuditLog.create.mockResolvedValue({ auditId: 1 });
  User.findByPk.mockResolvedValue({ userId: 1, isActive: true });
});

describe('HU-102 - createTable (registrar una nueva mesa)', () => {
  it('CA-1 numero nuevo: crea Resource + mesa "Disponible" y devuelve la mesa mapeada', async () => {
    const table = await createTable({
      tableNumber: '7', seatCount: 4, location: 'Terraza', userId: 1,
    });

    // Resource primero (la mesa es 1:1 con el recurso), en la transaccion.
    expect(Resource.create).toHaveBeenCalledWith({
      resourceType: 'restaurant_table', name: 'Mesa 7', status: 'available',
    }, { transaction: fakeTransaction });
    expect(RestaurantTable.create).toHaveBeenCalledWith({
      resourceId: 40, tableNumber: '7', seatCount: 4, location: 'Terraza', status: 'available',
    }, { transaction: fakeTransaction });
    expect(table).toEqual({
      tableId: 12,
      tableNumber: '7',
      seatCount: 4,
      location: 'Terraza',
      status: 'available',
      isActive: true,
      stateLabel: 'Activa',
      isOccupied: false,
    });
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, action: 'restaurant_table_created', entityType: 'restaurant_table', entityId: 12,
    }), { transaction: fakeTransaction });
  });

  it('CA-1 la ubicacion es opcional: ausente, vacia o con espacios queda null', async () => {
    await createTable({ tableNumber: '1', seatCount: 2 });
    await createTable({ tableNumber: '2', seatCount: 2, location: '   ' });
    const locations = RestaurantTable.create.mock.calls.map(([data]) => data.location);
    expect(locations).toEqual([null, null]);
  });

  it('CA-1 normaliza: recorta espacios y colapsa los de la ubicacion', async () => {
    await createTable({ tableNumber: '  12 ', seatCount: ' 6 ', location: '  Salon   principal ' });
    expect(RestaurantTable.create).toHaveBeenCalledWith(expect.objectContaining({
      tableNumber: '12', seatCount: 6, location: 'Salon principal',
    }), expect.anything());
  });

  it('CA-1 / CA-2 limite: "05" se guarda como "5" (no son mesas distintas)', async () => {
    await createTable({ tableNumber: '05', seatCount: 4 });
    expect(RestaurantTable.findOne).toHaveBeenCalledWith({ where: { tableNumber: '5' }, transaction: fakeTransaction });
    expect(Resource.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mesa 5' }), expect.anything());
    expect(RestaurantTable.create).toHaveBeenCalledWith(expect.objectContaining({ tableNumber: '5' }), expect.anything());
  });

  it('CA-1 acepta numeros alfanumericos con guion y los pasa a mayusculas ("t-1" -> "T-1")', async () => {
    const table = await createTable({ tableNumber: 't-1', seatCount: 2 });
    expect(table.tableNumber).toBe('T-1');
  });

  it('CA-2 numero existente: 409 TABLE_NUMBER_DUPLICATE y no guarda nada', async () => {
    RestaurantTable.findOne.mockResolvedValue({ tableId: 3, tableNumber: '5' });

    const error = await catchError(createTable({ tableNumber: '05', seatCount: 4 }));

    expect(error).toMatchObject({
      statusCode: 409,
      code: CODES.TABLE_NUMBER_DUPLICATE,
      message: MESSAGES.TABLE_NUMBER_DUPLICATE,
      details: { tableNumber: '5', tableId: 3 },
    });
    expect(error.message).toBe('Ya existe una mesa registrada con ese número');
    expect(Resource.create).not.toHaveBeenCalled();
    expect(RestaurantTable.create).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('CA-2 dos administradores a la vez: SequelizeUniqueConstraintError se traduce a 409 TABLE_NUMBER_DUPLICATE', async () => {
    // El chequeo previo paso, pero el otro admin inserto primero.
    RestaurantTable.create.mockRejectedValue(uniqueConstraintError());

    const error = await catchError(createTable({ tableNumber: '9', seatCount: 4 }));

    expect(error).toMatchObject({ statusCode: 409, code: CODES.TABLE_NUMBER_DUPLICATE, details: { tableNumber: '9' } });
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('CA-3 sin numero ni capacidad: 422 REQUIRED_FIELDS con un detalle por campo', async () => {
    const error = await catchError(createTable({ location: 'Terraza' }));

    expect(error).toMatchObject({
      statusCode: 422,
      code: CODES.REQUIRED_FIELDS,
      message: 'Los campos marcados con (*) son obligatorios',
    });
    expect(error.details.map((detail) => detail.field)).toEqual(['tableNumber', 'seatCount']);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('CA-3 numero en blanco cuenta como faltante; el resto de errores tambien se informa', async () => {
    const error = await catchError(createTable({ tableNumber: '   ', seatCount: 50 }));

    expect(error.code).toBe(CODES.REQUIRED_FIELDS);
    expect(error.details).toEqual([
      { field: 'tableNumber', message: 'El número de mesa es obligatorio.' },
      { field: 'seatCount', message: 'La capacidad debe ser un número entero entre 1 y 20.' },
    ]);
  });

  it.each([0, 21, 4.5, '4a', -1])('capacidad invalida (%s): 422 sin crear la mesa', async (seatCount) => {
    const error = await catchError(createTable({ tableNumber: '1', seatCount }));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'seatCount' }] });
    expect(error.code).toBeUndefined();
    expect(Resource.create).not.toHaveBeenCalled();
  });

  it.each(['M#1', 'A 1', '12345678901'])('numero con formato invalido (%s): 422', async (tableNumber) => {
    const error = await catchError(createTable({ tableNumber, seatCount: 4 }));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'tableNumber' }] });
  });

  it('ubicacion de mas de 60 caracteres: 422', async () => {
    const error = await catchError(createTable({ tableNumber: '1', seatCount: 4, location: 'x'.repeat(61) }));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'location' }] });
  });

  it('usuario indicado inexistente: 422 ACTING_USER_INVALID y no crea nada', async () => {
    User.findByPk.mockResolvedValue(null);
    const error = await catchError(createTable({ tableNumber: '1', seatCount: 4, userId: 999 }));
    expect(error).toMatchObject({ statusCode: 422, code: CODES.ACTING_USER_INVALID });
    expect(Resource.create).not.toHaveBeenCalled();
  });

  it('sin usuario (temporal hasta Sprint 5) la auditoria queda con userId null', async () => {
    await createTable({ tableNumber: '1', seatCount: 4 });
    expect(User.findByPk).not.toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null }), expect.anything());
  });

  it('un error inesperado de la BD no se disfraza de duplicado', async () => {
    Resource.create.mockRejectedValue(new Error('conexion perdida'));
    const error = await catchError(createTable({ tableNumber: '1', seatCount: 4 }));
    expect(error.message).toBe('conexion perdida');
    expect(error.statusCode).toBeUndefined();
  });
});
