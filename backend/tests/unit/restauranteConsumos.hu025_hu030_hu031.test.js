'use strict';

// HU-025 (agregar productos al pedido), HU-030 (consumo a nombre de un
// huesped de cabina) y HU-031 (saldo acumulado) - Sprint 4, Alison.
jest.mock('../../src/models', () => ({
  RestaurantTable: { findByPk: jest.fn() },
  RestaurantAccount: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), increment: jest.fn() },
  AccountItem: { create: jest.fn(), findAll: jest.fn() },
  Product: { findAll: jest.fn() },
  Booking: { findByPk: jest.fn(), findAll: jest.fn() },
  Resource: { findAll: jest.fn() },
  Customer: { findAll: jest.fn() },
  User: { findByPk: jest.fn() },
  AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn() },
}));
const request = require('supertest');
const app = require('../../src/app');
const {
  RestaurantTable, RestaurantAccount, AccountItem, Product, Booking, Resource, Customer, User, AuditLog, sequelize,
} = require('../../src/models');
const { addProductsToAccount } = require('../../src/modules/restaurante/cuentaPedido.service');
const {
  registerGuestConsumption, getGuestBalance, searchGuests,
} = require('../../src/modules/restaurante/consumoHuesped.service');
const { cabinMatches } = require('../../src/modules/restaurante/restaurante.util');

// --- Datos de prueba ---------------------------------------------------
const product = (overrides = {}) => ({
  productId: 1, name: 'Casado', category: 'plato fuerte', price: 4500, stockQuantity: 10, isAvailable: true,
  update: jest.fn(async function update(values) { Object.assign(this, values); return this; }),
  ...overrides,
});
const line = (overrides = {}) => ({
  itemId: 1, accountId: 5, productId: 1, quantity: 1, unitPrice: 4500, kitchenStatus: 'pending',
  isRemoved: false, createdAt: new Date('2026-10-14T18:00:00Z'), product: { name: 'Casado', category: 'plato fuerte' },
  ...overrides,
});
let account; let items; let products; let tableRow;

beforeEach(() => {
  jest.resetAllMocks();
  sequelize.transaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  account = { accountId: 5, tableId: 2, status: 'open', version: 3, bookingId: null, customerId: null, openedAt: new Date('2026-10-14T17:00:00Z') };
  tableRow = { tableId: 2, tableNumber: '2', seatCount: 4, status: 'occupied', update: jest.fn(async function update(v) { Object.assign(this, v); }) };
  products = [product()];
  items = [];
  RestaurantAccount.findByPk.mockImplementation(async () => ({ ...account }));
  RestaurantAccount.increment.mockImplementation(async () => { account.version += 1; });
  RestaurantTable.findByPk.mockImplementation(async () => tableRow);
  Product.findAll.mockImplementation(async ({ where }) => {
    const ids = where?.productId ? Object.getOwnPropertySymbols(where.productId).map((s) => where.productId[s]).flat() : [];
    return products.filter((p) => ids.includes(p.productId));
  });
  AccountItem.create.mockImplementation(async (values) => {
    const created = line({ itemId: items.length + 1, ...values, product: { name: products.find((p) => p.productId === values.productId)?.name } });
    items.push(created);
    return created;
  });
  AccountItem.findAll.mockImplementation(async () => items.filter((i) => !i.isRemoved));
});

// =====================================================================
describe('HU-025 - Agregar productos al pedido de una cuenta de mesa activa', () => {
  test('CA-1 agrega el producto y devuelve nombre, cantidad, precio unitario, subtotal y consumo acumulado', async () => {
    const detail = await addProductsToAccount(5, { items: [{ productId: 1, quantity: 3 }], userId: 4 });
    expect(AccountItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 5, productId: 1, quantity: 3, unitPrice: 4500, kitchenStatus: 'pending' }),
      expect.any(Object),
    );
    expect(detail.items).toEqual([expect.objectContaining({ name: 'Casado', quantity: 3, unitPrice: 4500, subtotal: 13500 })]);
    expect(detail.accumulatedTotal).toBe(13500);
    expect(detail.itemCount).toBe(3);
    expect(detail.table).toMatchObject({ tableNumber: '2' });
  });

  test('CA-1 varios productos en un solo envio; el consumo acumulado se actualiza', async () => {
    products = [product(), product({ productId: 2, name: 'Refresco', price: 1500, category: 'bebida' })];
    items.push(line({ itemId: 90, quantity: 1, unitPrice: 4500 })); // ya estaba en la cuenta
    const detail = await addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 2 }] });
    expect(detail.items).toHaveLength(3);
    expect(detail.accumulatedTotal).toBe(4500 + 4500 + 3000);
  });

  test('un mismo producto repetido en el envio se suma antes de validar existencias', async () => {
    products = [product({ stockQuantity: 5 })];
    await expect(addProductsToAccount(5, { items: [{ productId: 1, quantity: 3 }, { productId: 1, quantity: 3 }] }))
      .rejects.toMatchObject({ statusCode: 409, code: 'INSUFFICIENT_STOCK' });
    expect(AccountItem.create).not.toHaveBeenCalled();
  });

  test('CA-2 usa el precio vigente al agregar y conserva el precio de las lineas anteriores', async () => {
    items.push(line({ itemId: 90, quantity: 2, unitPrice: 4000 })); // se pidio cuando costaba 4000
    products = [product({ price: 4500 })]; // el precio cambio despues
    const detail = await addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] });
    const prices = detail.items.map((item) => item.unitPrice);
    expect(prices).toEqual([4000, 4500]);
    expect(detail.accumulatedTotal).toBe(2 * 4000 + 4500); // no se recalcula retroactivamente
  });

  test('CA-3 sin existencias: "Producto sin existencias disponibles" y no se agrega', async () => {
    products = [product({ stockQuantity: 0, isAvailable: false, name: 'Pargo' })];
    await expect(addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] })).rejects.toMatchObject({
      statusCode: 409,
      code: 'PRODUCT_OUT_OF_STOCK',
      message: 'Producto sin existencias disponibles',
      details: expect.objectContaining({ productName: 'Pargo' }),
    });
    expect(AccountItem.create).not.toHaveBeenCalled();
    expect(RestaurantAccount.increment).not.toHaveBeenCalled();
  });

  test('CA-3 es todo o nada: si un producto del envio esta agotado no se agrega ninguno', async () => {
    products = [product(), product({ productId: 2, name: 'Pargo', stockQuantity: 0, isAvailable: false })];
    await expect(addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }] }))
      .rejects.toMatchObject({ message: 'Producto sin existencias disponibles' });
    expect(AccountItem.create).not.toHaveBeenCalled();
    expect(products[0].update).not.toHaveBeenCalled();
  });

  test('descuenta existencias y, al llegar a cero, deja el producto "Agotado"', async () => {
    products = [product({ stockQuantity: 2 })];
    await addProductsToAccount(5, { items: [{ productId: 1, quantity: 2 }] });
    expect(products[0].update).toHaveBeenCalledWith({ stockQuantity: 0, isAvailable: false }, expect.any(Object));
  });

  test('descuenta existencias sin marcar agotado mientras queden unidades', async () => {
    products = [product({ stockQuantity: 10 })];
    await addProductsToAccount(5, { items: [{ productId: 1, quantity: 4 }] });
    expect(products[0].update).toHaveBeenCalledWith({ stockQuantity: 6 }, expect.any(Object));
  });

  test('pedir mas de lo que hay: avisa cuantas quedan', async () => {
    products = [product({ stockQuantity: 2 })];
    await expect(addProductsToAccount(5, { items: [{ productId: 1, quantity: 5 }] })).rejects.toMatchObject({
      statusCode: 409, code: 'INSUFFICIENT_STOCK', message: expect.stringContaining('Solo quedan 2 unidades'),
    });
  });

  test('producto desactivado del menu (con existencias): no se ofrece', async () => {
    products = [product({ isAvailable: false })];
    await expect(addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 409, code: 'PRODUCT_UNAVAILABLE' });
  });

  test('cada cambio incrementa la version de la cuenta (HU-026/HU-027 la comparan)', async () => {
    await addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] });
    expect(RestaurantAccount.increment).toHaveBeenCalledWith('version', expect.objectContaining({ by: 1, where: { accountId: 5 } }));
    expect((await addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] })).version).toBe(5);
  });

  test('la cuenta y los productos se bloquean dentro de la transaccion', async () => {
    await addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] });
    expect(RestaurantAccount.findByPk).toHaveBeenCalledWith(5, expect.objectContaining({ lock: 'UPDATE' }));
    expect(Product.findAll).toHaveBeenCalledWith(expect.objectContaining({ lock: 'UPDATE' }));
  });

  test('cuenta cerrada: "No es posible modificar una cuenta cerrada"', async () => {
    account.status = 'closed';
    await expect(addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] })).rejects.toMatchObject({
      statusCode: 409, code: 'ACCOUNT_CLOSED', message: 'No es posible modificar una cuenta cerrada',
    });
    expect(AccountItem.create).not.toHaveBeenCalled();
  });

  test('cuenta anulada y cuenta inexistente', async () => {
    account.status = 'cancelled';
    await expect(addProductsToAccount(5, { items: [{ productId: 1, quantity: 1 }] })).rejects.toMatchObject({ statusCode: 409 });
    RestaurantAccount.findByPk.mockResolvedValueOnce(null);
    await expect(addProductsToAccount(99, { items: [{ productId: 1, quantity: 1 }] })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('producto inexistente: 404', async () => {
    products = [];
    await expect(addProductsToAccount(5, { items: [{ productId: 7, quantity: 1 }] })).rejects.toMatchObject({ statusCode: 404 });
  });

  test.each([
    [[]], [undefined], [[{ productId: 1, quantity: 0 }]], [[{ productId: 1, quantity: 1.5 }]],
    [[{ productId: 1, quantity: 100 }]], [[{ productId: 'x', quantity: 1 }]],
  ])('forma invalida del pedido %j: 422 sin abrir transaccion', async (invalid) => {
    await expect(addProductsToAccount(5, { items: invalid })).rejects.toMatchObject({ statusCode: 422 });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  test('endpoint: valida id y productos antes de consultar datos', async () => {
    const badId = await request(app).post('/api/restaurant-accounts/abc/items').send({ items: [{ productId: 1, quantity: 1 }] });
    expect(badId.status).toBe(422);
    const noItems = await request(app).post('/api/restaurant-accounts/5/items').send({ items: [] });
    expect(noItems.status).toBe(422);
    const badQty = await request(app).post('/api/restaurant-accounts/5/items').send({ items: [{ productId: 1, quantity: 0 }] });
    expect(badQty.status).toBe(422);
    expect(RestaurantAccount.findByPk).not.toHaveBeenCalled();
  });

  test('endpoint: respuesta 201 con el detalle y 409 con mensaje y code', async () => {
    const ok = await request(app).post('/api/restaurant-accounts/5/items').send({ items: [{ productId: 1, quantity: 2 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.accumulatedTotal).toBe(9000);
    products = [product({ stockQuantity: 0 })];
    const sold = await request(app).post('/api/restaurant-accounts/5/items').send({ items: [{ productId: 1, quantity: 1 }] });
    expect(sold.status).toBe(409);
    expect(sold.body.error).toMatchObject({ code: 'PRODUCT_OUT_OF_STOCK', message: 'Producto sin existencias disponibles' });
  });
});

// =====================================================================
// HU-030 / HU-031: reserva de cabina del huesped
const cabinBooking = (overrides = {}) => ({
  bookingId: 20, resourceId: 3, customerId: 8, status: 'checked_in',
  startDatetime: new Date('2026-10-13T18:00:00Z'), endDatetime: new Date('2026-10-16T17:00:00Z'),
  resource: { resourceId: 3, resourceType: 'cabin', name: 'Cabina 1' },
  customer: { customerId: 8, fullName: 'Ana Mora Soto', phone: '88880000' },
  ...overrides,
});

describe('HU-030 - Registrar un consumo del restaurante a nombre de un huesped de cabina', () => {
  let booking;
  beforeEach(() => {
    booking = cabinBooking();
    Booking.findByPk.mockImplementation(async () => booking);
    Booking.findAll.mockResolvedValue([booking]);
    Resource.findAll.mockResolvedValue([{ resourceId: 3, resourceType: 'cabin', name: 'Cabina 1' }]);
    Customer.findAll.mockResolvedValue([{ customerId: 8 }]);
    User.findByPk.mockResolvedValue({ userId: 4, isActive: true });
    tableRow = { tableId: 2, tableNumber: '2', seatCount: 4, status: 'available', update: jest.fn(async function update(v) { Object.assign(this, v); }) };
    RestaurantAccount.findOne.mockResolvedValue(null);
    RestaurantAccount.create.mockImplementation(async (values) => { account = { accountId: 5, version: 1, ...values }; return account; });
    RestaurantAccount.findAll.mockImplementation(async () => (account.bookingId ? [{ ...account, table: tableRow }] : []));
  });

  test('CA-1 huesped con reserva en curso: crea la cuenta vinculada a su reserva y ocupa la mesa', async () => {
    const result = await registerGuestConsumption({
      bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 2 }],
    });
    expect(RestaurantAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 2, bookingId: 20, customerId: 8, openedByUserId: 4, status: 'open' }),
      expect.any(Object),
    );
    expect(tableRow.update).toHaveBeenCalledWith({ status: 'occupied' }, expect.any(Object));
    expect(result.createdAccount).toBe(true);
    expect(result.guest).toMatchObject({ bookingId: 20, guestName: 'Ana Mora Soto', cabinName: 'Cabina 1', accumulatedBalance: 9000 });
    expect(result.account.accumulatedTotal).toBe(9000);
  });

  test('CA-1 tambien identifica al huesped por numero de cabina o por nombre de la reserva', async () => {
    const byCabin = await registerGuestConsumption({ cabin: '1', tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] });
    expect(byCabin.guest.bookingId).toBe(20);
    account = { accountId: 5, tableId: 2, status: 'open', version: 1 };
    tableRow.status = 'available';
    const byName = await registerGuestConsumption({ guestName: 'ana mora', tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] });
    expect(byName.guest.bookingId).toBe(20);
  });

  test('CA-2 huesped sin check-in: "El huesped no cuenta con una reserva activa" y no vincula nada', async () => {
    booking.status = 'active';
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 409, code: 'GUEST_WITHOUT_ACTIVE_BOOKING', message: 'El huésped no cuenta con una reserva activa' });
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
    expect(AccountItem.create).not.toHaveBeenCalled();
  });

  test.each(['completed', 'cancelled', 'pending'])('CA-2 reserva %s tampoco es "en curso"', async (status) => {
    booking.status = status;
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ message: 'El huésped no cuenta con una reserva activa' });
  });

  test('CA-2 buscando por nombre o cabina sin reservas en curso', async () => {
    Booking.findAll.mockResolvedValue([]);
    await expect(registerGuestConsumption({ guestName: 'Nadie', tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 409, code: 'GUEST_WITHOUT_ACTIVE_BOOKING' });
  });

  test('CA-2 la reserva debe ser de una cabina', async () => {
    booking.resource = { resourceId: 9, resourceType: 'field', name: 'Cancha' };
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 404 });
    Booking.findByPk.mockResolvedValueOnce(null);
    await expect(registerGuestConsumption({ bookingId: 77, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('mas de un huesped en curso con ese dato: pide elegir la reserva', async () => {
    Booking.findAll.mockResolvedValue([booking, cabinBooking({ bookingId: 21, customer: { customerId: 9, fullName: 'Ana Rojas', phone: '88881111' } })]);
    await expect(registerGuestConsumption({ guestName: 'Ana', tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 409, code: 'GUEST_AMBIGUOUS', details: { candidates: expect.any(Array) } });
  });

  test('CA-3 consumo adicional: reutiliza la cuenta abierta y el saldo acumulado se actualiza', async () => {
    account = { accountId: 5, tableId: 2, status: 'open', version: 2, bookingId: 20, customerId: 8 };
    items.push(line({ itemId: 50, quantity: 1, unitPrice: 4500 })); // primer pedido de la estadia
    RestaurantAccount.findOne.mockResolvedValue({ ...account });
    const result = await registerGuestConsumption({ bookingId: 20, userId: 4, items: [{ productId: 1, quantity: 2 }] });
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
    expect(result.createdAccount).toBe(false);
    expect(result.guest.accumulatedBalance).toBe(4500 + 9000);
    expect(result.account.items).toHaveLength(2);
  });

  test('sin cuenta abierta y sin mesa: pide la mesa', async () => {
    await expect(registerGuestConsumption({ bookingId: 20, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 422, code: 'TABLE_REQUIRED' });
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
  });

  test.each([['occupied', 'TABLE_OCCUPIED'], ['inactive', 'TABLE_INACTIVE']])('mesa %s: no se puede usar', async (status, code) => {
    tableRow.status = status;
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 409, code });
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
  });

  test('mesa con otra cuenta abierta: ocupada aunque su estado no se haya sincronizado', async () => {
    RestaurantAccount.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ accountId: 9 });
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ code: 'TABLE_OCCUPIED' });
  });

  test('exige un usuario valido y activo', async () => {
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 422 });
    User.findByPk.mockResolvedValue({ userId: 4, isActive: false });
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(RestaurantAccount.create).not.toHaveBeenCalled();
  });

  test('aplica las mismas reglas de existencias que el pedido normal (HU-025)', async () => {
    products = [product({ stockQuantity: 0, isAvailable: false })];
    await expect(registerGuestConsumption({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ message: 'Producto sin existencias disponibles' });
  });

  test('endpoint: valida la forma y responde 201', async () => {
    const invalid = await request(app).post('/api/restaurant-accounts/guest-consumption').send({ bookingId: 20, items: [] });
    expect(invalid.status).toBe(422);
    const ok = await request(app).post('/api/restaurant-accounts/guest-consumption')
      .send({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.guest).toMatchObject({ bookingId: 20 });
    booking.status = 'active';
    const noStay = await request(app).post('/api/restaurant-accounts/guest-consumption')
      .send({ bookingId: 20, tableId: 2, userId: 4, items: [{ productId: 1, quantity: 1 }] });
    expect(noStay.status).toBe(409);
    expect(noStay.body.error.message).toBe('El huésped no cuenta con una reserva activa');
  });
});

describe('Busqueda de huesped por numero de cabina o nombre', () => {
  test('cabinMatches: "3", "cabina 3" y nombre parcial', () => {
    expect(cabinMatches('Cabina 3', '3')).toBe(true);
    expect(cabinMatches('Cabina 3', 'cabina 3')).toBe(true);
    expect(cabinMatches('Cabina 3', 'Cabina')).toBe(true);
    expect(cabinMatches('Cabina 13', '3')).toBe(false); // "3" no debe traer la cabina 13
    expect(cabinMatches('Cabina 3', '')).toBe(false);
  });

  test('marca cuales estan en curso y su saldo acumulado', async () => {
    Resource.findAll.mockResolvedValue([{ resourceId: 3, resourceType: 'cabin', name: 'Cabina 1' }]);
    Customer.findAll.mockResolvedValue([{ customerId: 8 }]);
    Booking.findAll.mockResolvedValue([cabinBooking(), cabinBooking({ bookingId: 21, status: 'active' })]);
    account = { accountId: 5, tableId: 2, status: 'open', bookingId: 20 };
    RestaurantAccount.findAll.mockResolvedValue([{ ...account, table: { tableNumber: '2' } }]);
    items.push(line({ quantity: 2, unitPrice: 1000 }));
    const result = await searchGuests({ q: 'Ana' });
    expect(result.map((g) => [g.bookingId, g.inCourse])).toEqual([[20, true], [21, false]]);
    expect(result[0].accumulatedBalance).toBe(2000);
    expect(result[1].accumulatedBalance).toBe(0);
  });

  test('texto vacio no consulta nada; "%" se busca literal', async () => {
    expect(await searchGuests({ q: '   ' })).toEqual([]);
    expect(Resource.findAll).not.toHaveBeenCalled();
    Resource.findAll.mockResolvedValue([{ resourceId: 3, resourceType: 'cabin', name: 'Cabina 1' }]);
    Customer.findAll.mockResolvedValue([]);
    await searchGuests({ q: '50%' });
    const where = Customer.findAll.mock.calls[0][0].where.fullName;
    expect(Object.getOwnPropertySymbols(where).map((s) => where[s])).toEqual(['%50\\%%']);
  });

  test('endpoint exige el texto de busqueda', async () => {
    const response = await request(app).get('/api/restaurant-accounts/guests');
    expect(response.status).toBe(422);
  });
});

describe('HU-031 - Consultar el saldo acumulado de consumos de un huesped', () => {
  beforeEach(() => {
    Booking.findByPk.mockResolvedValue(cabinBooking());
    account = { accountId: 5, tableId: 2, status: 'open', bookingId: 20 };
    RestaurantAccount.findAll.mockImplementation(async () => [{ ...account, table: { tableNumber: '2' } }]);
  });

  test('CA-1 con consumos: detalle con fecha, producto y monto, y el saldo total', async () => {
    items.push(
      line({ itemId: 1, quantity: 2, unitPrice: 4500, createdAt: new Date('2026-10-14T18:00:00Z') }),
      line({ itemId: 2, quantity: 1, unitPrice: 1500, product: { name: 'Refresco' }, createdAt: new Date('2026-10-15T01:00:00Z') }),
    );
    const result = await getGuestBalance(20);
    expect(result.hasConsumptions).toBe(true);
    expect(result.message).toBeNull();
    expect(result.consumptions).toEqual([
      expect.objectContaining({ productName: 'Casado', quantity: 2, unitPrice: 4500, amount: 9000, tableNumber: '2' }),
      expect.objectContaining({ productName: 'Refresco', amount: 1500 }),
    ]);
    expect(result.consumptions[0].date).toEqual(new Date('2026-10-14T18:00:00Z'));
    expect(result.total).toBe(10500);
    expect(result.guest).toMatchObject({ guestName: 'Ana Mora Soto', cabinName: 'Cabina 1', accumulatedBalance: 10500 });
    expect(result.generatedAt).toEqual(expect.any(String));
  });

  test('no cuenta cuentas anuladas ni lineas retiradas', async () => {
    items.push(line({ itemId: 1, quantity: 1, unitPrice: 1000 }), line({ itemId: 2, quantity: 5, unitPrice: 1000, isRemoved: true }));
    await getGuestBalance(20);
    expect(RestaurantAccount.findAll.mock.calls[0][0].where.status).toBeDefined();
    expect(AccountItem.findAll.mock.calls[0][0].where.isRemoved).toBe(false);
    expect((await getGuestBalance(20)).total).toBe(1000);
  });

  test('CA-2 sin consumos: "Este huesped no tiene consumos registrados en el restaurante"', async () => {
    RestaurantAccount.findAll.mockResolvedValue([]);
    const result = await getGuestBalance(20);
    expect(result).toMatchObject({
      hasConsumptions: false, consumptions: [], total: 0,
      message: 'Este huésped no tiene consumos registrados en el restaurante',
    });
  });

  test('reserva inexistente o que no es de cabina: 404', async () => {
    Booking.findByPk.mockResolvedValueOnce(null);
    await expect(getGuestBalance(1)).rejects.toMatchObject({ statusCode: 404 });
    Booking.findByPk.mockResolvedValueOnce(cabinBooking({ resource: { resourceType: 'field' } }));
    await expect(getGuestBalance(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('endpoint: exige la reserva y responde el detalle', async () => {
    const missing = await request(app).get('/api/restaurant-accounts/guest-balance');
    expect(missing.status).toBe(422);
    items.push(line({ quantity: 1, unitPrice: 2500 }));
    const ok = await request(app).get('/api/restaurant-accounts/guest-balance?bookingId=20');
    expect(ok.status).toBe(200);
    expect(ok.body.data.total).toBe(2500);
  });
});
