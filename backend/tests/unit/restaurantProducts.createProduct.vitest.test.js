import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-113 (Marvin, Sprint 4) - Registrar un producto del
// menu.
//
// Unidad bajo prueba: createProduct() (y listCategories()) en
// catalogoProductos.service.js.
//   CA-1 Registro exitoso                          -> aqui
//   CA-2 Mismo nombre en la misma categoria        -> aqui
//   CA-3 Campos obligatorios (nombre/categoria/precio) -> aqui
//   CA-4 Cancelacion                               -> solo frontend
//
// Misma tecnica de require.cache que las demas pruebas Vitest.
//
// Ejecutar: (desde backend/)  npx vitest run tests/unit/restaurantProducts.createProduct.vitest.test.js --reporter=verbose

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  Product: { findAll: vi.fn(), create: vi.fn() },
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

const { createProduct, listCategories } = nodeRequire('../../src/modules/restaurante/catalogoProductos.service');
const { MESSAGES, CODES } = nodeRequire('../../src/modules/restaurante/restaurante.util');

const {
  Product, AuditLog, User, sequelize,
} = mockModels;

const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };

function uniqueConstraintError() {
  const error = new Error('Validation error');
  error.name = 'SequelizeUniqueConstraintError';
  return error;
}

async function catchError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error y la operacion termino bien.');
}

const validPayload = (overrides = {}) => ({
  name: 'Casado de pollo', category: 'Plato fuerte', price: 4500, stockQuantity: 10, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  sequelize.transaction.mockImplementation(async (callback) => callback(fakeTransaction));
  Product.findAll.mockResolvedValue([]); // categoria sin productos
  // DECIMAL vuelve como string, igual que Sequelize con MySQL.
  Product.create.mockImplementation(async (data) => ({ productId: 30, ...data }));
  AuditLog.create.mockResolvedValue({ auditId: 1 });
  User.findByPk.mockResolvedValue({ userId: 1, isActive: true });
});

describe('HU-113 - listCategories', () => {
  it('devuelve la lista oficial (entrada, plato fuerte, bebida, postre)', () => {
    expect(listCategories()).toEqual([
      { value: 'Entrada', label: 'Entrada' },
      { value: 'Plato fuerte', label: 'Plato fuerte' },
      { value: 'Bebida', label: 'Bebida' },
      { value: 'Postre', label: 'Postre' },
    ]);
  });
});

describe('HU-113 - createProduct (registrar producto del menu)', () => {
  it('CA-1 nombre nuevo: crea el producto disponible y lo devuelve con la forma del catalogo (HU-114)', async () => {
    const product = await createProduct(validPayload({ userId: 1 }));

    expect(Product.create).toHaveBeenCalledWith({
      name: 'Casado de pollo', category: 'Plato fuerte', price: '4500.00', stockQuantity: 10, isAvailable: true,
    }, { transaction: fakeTransaction });
    expect(product).toEqual({
      productId: 30,
      name: 'Casado de pollo',
      category: 'Plato fuerte',
      price: 4500,
      stockQuantity: 10,
      soldOut: false,
      status: 'Disponible',
      isAvailable: true,
    });
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, action: 'restaurant_product_created', entityType: 'product', entityId: 30,
    }), { transaction: fakeTransaction });
  });

  it('CA-1 existencias opcionales: por defecto 0 (isAvailable true, el catalogo lo muestra "Agotado")', async () => {
    const product = await createProduct(validPayload({ stockQuantity: undefined }));
    expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({ stockQuantity: 0, isAvailable: true }), expect.anything());
    expect(product).toMatchObject({ isAvailable: true, soldOut: true, status: 'Agotado' });
  });

  it('CA-1 normaliza nombre (recorta y colapsa espacios), categoria ("bebida" -> "Bebida") y precio en texto', async () => {
    await createProduct(validPayload({ name: '  Café   negro ', category: ' bebida ', price: '1200.5' }));
    expect(Product.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { category: 'Bebida' } }));
    expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Café negro', category: 'Bebida', price: '1200.50',
    }), expect.anything());
  });

  it('CA-2 mismo nombre en la misma categoria (sin distinguir mayusculas ni tildes): 409 PRODUCT_DUPLICATE', async () => {
    Product.findAll.mockResolvedValue([{ productId: 8, name: 'Cafe Negro' }]);

    const error = await catchError(createProduct(validPayload({ name: 'café  negro', category: 'Bebida' })));

    expect(error).toMatchObject({
      statusCode: 409,
      code: CODES.PRODUCT_DUPLICATE,
      details: { name: 'café negro', category: 'Bebida', productId: 8 },
    });
    expect(error.message).toBe('Ya existe un producto con ese nombre en esta categoría');
    expect(error.message).toBe(MESSAGES.PRODUCT_DUPLICATE);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('CA-2 el mismo nombre en OTRA categoria si se permite (solo se compara dentro de la categoria)', async () => {
    // findAll se filtra por categoria: en "Postre" no hay "Flan".
    await createProduct(validPayload({ name: 'Flan', category: 'Postre' }));
    expect(Product.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { category: 'Postre' } }));
    expect(Product.create).toHaveBeenCalled();
  });

  it('CA-2 dos administradores a la vez: SequelizeUniqueConstraintError -> 409 PRODUCT_DUPLICATE', async () => {
    Product.create.mockRejectedValue(uniqueConstraintError());
    const error = await catchError(createProduct(validPayload()));
    expect(error).toMatchObject({ statusCode: 409, code: CODES.PRODUCT_DUPLICATE });
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('CA-3 sin nombre, categoria ni precio: 422 REQUIRED_FIELDS con un detalle por campo', async () => {
    const error = await catchError(createProduct({ stockQuantity: 5 }));
    expect(error).toMatchObject({
      statusCode: 422,
      code: CODES.REQUIRED_FIELDS,
      message: 'Los campos marcados con (*) son obligatorios',
    });
    expect(error.details.map((detail) => detail.field)).toEqual(['name', 'category', 'price']);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('CA-3 solo falta el precio (nombre en blanco tambien cuenta como faltante)', async () => {
    const error = await catchError(createProduct({ name: '   ', category: 'Entrada' }));
    expect(error.code).toBe(CODES.REQUIRED_FIELDS);
    expect(error.details.map((detail) => detail.field)).toEqual(['name', 'price']);
  });

  it('categoria fuera de la lista oficial: 422', async () => {
    const error = await catchError(createProduct(validPayload({ category: 'Snacks' })));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'category' }] });
    expect(error.code).toBeUndefined();
  });

  it.each([0, -10, '12.345', 100000000, 'abc', '1e3'])('precio invalido (%s): 422', async (price) => {
    const error = await catchError(createProduct(validPayload({ price })));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'price' }] });
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('precio limite 99 999 999.99 si se acepta', async () => {
    await createProduct(validPayload({ price: 99999999.99 }));
    expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({ price: '99999999.99' }), expect.anything());
  });

  it.each([-1, 2.5, 'diez'])('existencias invalidas (%s): 422', async (stockQuantity) => {
    const error = await catchError(createProduct(validPayload({ stockQuantity })));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'stockQuantity' }] });
  });

  it('nombre de mas de 100 caracteres: 422', async () => {
    const error = await catchError(createProduct(validPayload({ name: 'a'.repeat(101) })));
    expect(error).toMatchObject({ statusCode: 422, details: [{ field: 'name' }] });
  });

  it('usuario indicado inactivo: 422 ACTING_USER_INVALID', async () => {
    User.findByPk.mockResolvedValue({ userId: 2, isActive: false });
    const error = await catchError(createProduct(validPayload({ userId: 2 })));
    expect(error).toMatchObject({ statusCode: 422, code: CODES.ACTING_USER_INVALID });
    expect(Product.create).not.toHaveBeenCalled();
  });
});
