import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-104 (Marvin, Sprint 4) - Buscar mesa por numero o
// capacidad.
//
// Unidad bajo prueba: listTables(criteria) en catalogoMesas.service.js
// (extension retrocompatible del listado de HU-103).
//   CA-1 Busqueda exitosa (numero exacto y/o capacidad minima) -> aqui
//   CA-2 Sin coincidencias -> items = [] (no es un error)        -> aqui
//
// Misma tecnica de require.cache que las demas pruebas Vitest.
//
// Ejecutar: (desde backend/)  npx vitest run tests/unit/restaurantTables.searchTables.vitest.test.js --reporter=verbose

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  RestaurantTable: { findAll: vi.fn(), findOne: vi.fn(), findByPk: vi.fn() },
  RestaurantAccount: { findOne: vi.fn() },
  Resource: { findByPk: vi.fn() },
  Booking: {},
  ResourceBlock: {},
  CabinDetail: {},
  EventHallPricingPlan: {},
  FieldRate: {},
  AuditLog: { create: vi.fn() },
  User: { findByPk: vi.fn(), findOne: vi.fn() },
  Role: {},
  sequelize: { transaction: vi.fn() },
};

const modelsAbsolutePath = nodeRequire.resolve('../../src/models');
nodeRequire.cache[modelsAbsolutePath] = {
  id: modelsAbsolutePath,
  filename: modelsAbsolutePath,
  loaded: true,
  exports: mockModels,
};

const { listTables } = nodeRequire('../../src/modules/restaurante/catalogoMesas.service');

const { RestaurantTable } = mockModels;

async function catchError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error y la operacion termino bien.');
}

const row = (tableId, tableNumber, seatCount, status = 'available', location = null) => ({
  tableId, resourceId: 100 + tableId, tableNumber, seatCount, status, location,
});

// Catalogo de ejemplo: 5 mesas, una inactiva. Capacidad activa = 2+4+6+8 = 20.
const CATALOG = [
  row(1, '1', 2),
  row(2, '5', 4, 'occupied', 'Terraza'),
  row(3, '15', 6),
  row(4, '2', 8),
  row(5, 'A-1', 10, 'inactive'),
];
const SUMMARY = { total: 5, activeTotal: 4, inactiveTotal: 1, totalCapacity: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  RestaurantTable.findAll.mockResolvedValue(CATALOG);
});

describe('HU-104 - listTables con filtros (buscar mesa)', () => {
  it('sin filtros responde EXACTAMENTE como HU-103 (sin matchedTotal ni filters)', async () => {
    const result = await listTables();
    expect(Object.keys(result).sort()).toEqual(['activeTotal', 'inactiveTotal', 'items', 'total', 'totalCapacity']);
    expect(result).toMatchObject(SUMMARY);
    expect(result.items.map((table) => table.tableNumber)).toEqual(['1', '2', '5', '15', 'A-1']);
  });

  it('parametros vacios (?number=&minSeats=) equivalen a no filtrar', async () => {
    const result = await listTables({ number: '', minSeats: '  ' });
    expect(result).not.toHaveProperty('matchedTotal');
    expect(result.items).toHaveLength(5);
  });

  it('CA-1 por numero: coincidencia EXACTA ("5" no trae la mesa 15)', async () => {
    const result = await listTables({ number: '5' });
    expect(result.items.map((table) => table.tableNumber)).toEqual(['5']);
    expect(result.items[0]).toMatchObject({ location: 'Terraza', isOccupied: true });
    expect(result).toMatchObject({ ...SUMMARY, matchedTotal: 1, filters: { number: '5' } });
  });

  it('CA-1 limite: "05" encuentra la mesa 5 (misma normalizacion que HU-102)', async () => {
    const result = await listTables({ number: ' 05 ' });
    expect(result.items.map((table) => table.tableNumber)).toEqual(['5']);
    expect(result.filters).toEqual({ number: '5' });
  });

  it('CA-1 numero alfanumerico sin distinguir mayusculas ("a-1" -> "A-1"), incluye inactivas', async () => {
    const result = await listTables({ number: 'a-1' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ tableNumber: 'A-1', isActive: false, stateLabel: 'Inactiva' });
  });

  it('CA-1 por capacidad minima: seatCount >= minSeats, ordenadas por numero', async () => {
    const result = await listTables({ minSeats: '6' });
    expect(result.items.map((table) => table.tableNumber)).toEqual(['2', '15', 'A-1']);
    expect(result).toMatchObject({ matchedTotal: 3, filters: { minSeats: 6 } });
  });

  it('CA-1 filtros combinados (numero Y capacidad)', async () => {
    expect((await listTables({ number: '15', minSeats: 6 })).items).toHaveLength(1);
    expect((await listTables({ number: '1', minSeats: 6 })).items).toHaveLength(0);
  });

  it('CA-1 los totales siguen siendo del catalogo completo, no de lo filtrado', async () => {
    const result = await listTables({ minSeats: 8 });
    expect(result).toMatchObject({ ...SUMMARY, matchedTotal: 2 });
  });

  it('CA-2 sin coincidencias: items = [] y matchedTotal 0 (no es un error)', async () => {
    const result = await listTables({ number: '99' });
    expect(result.items).toEqual([]);
    expect(result).toMatchObject({ matchedTotal: 0, filters: { number: '99' }, total: 5 });
  });

  it('CA-2 capacidad mayor a todas: items = []', async () => {
    const result = await listTables({ minSeats: 20 });
    expect(result.items).toEqual([]);
  });

  it.each(['0', '21', 'abc', '2.5'])('capacidad minima invalida (%s): 422 con details', async (minSeats) => {
    const error = await catchError(listTables({ minSeats }));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'minSeats' }] });
    expect(RestaurantTable.findAll).not.toHaveBeenCalled();
  });

  it('numero con formato invalido: 422 con details', async () => {
    const error = await catchError(listTables({ number: 'M#1' }));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'number' }] });
  });

  it('ambos criterios invalidos: un detalle por campo', async () => {
    const error = await catchError(listTables({ number: '!!', minSeats: '-3' }));
    expect(error.details.map((detail) => detail.field)).toEqual(['number', 'minSeats']);
  });
});
