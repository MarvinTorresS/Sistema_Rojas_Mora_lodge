'use strict';

// Pruebas del bug "la reserva queda a nombre del dueno del telefono"
// (26/10/2026) y de su correccion: services/customerResolution.service.js.
//
// Bug original: cancha y salon hacian Customer.findOrCreate({ where:
// { phone } }). Si el telefono ya existia, se ignoraba el nombre escrito y
// la reserva quedaba ligada al cliente anterior, sin aviso.
//
// Se mockea la capa de modelos (igual que reservasCancha.service.test.js):
// no hace falta MySQL ni Docker.

jest.mock('../../src/models', () => ({
  AuditLog: { create: jest.fn(), findAll: jest.fn(async () => []) },
  Booking: { findAndCountAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Resource: { name: 'Resource', findOne: jest.fn() },
  ResourceBlock: { name: 'ResourceBlock', findOne: jest.fn() },
  Customer: { name: 'Customer', findAll: jest.fn(), create: jest.fn() },
  EventHallPricingPlan: { findOne: jest.fn(), findAll: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));

const request = require('supertest');
const { Sequelize, Op } = require('sequelize');
const app = require('../../src/app');
const {
  Booking, Resource, ResourceBlock, Customer, EventHallPricingPlan,
} = require('../../src/models');
const {
  matchCustomerByPhone, namesMatch, buildPhoneLookupWhere, CUSTOMER_PHONE_CONFLICT_CODE,
} = require('../../src/services/customerResolution.service');

const JUAN = { customerId: 4, fullName: 'Juan Pérez Mora', phone: '88887777' };
const ANA = { customerId: 9, fullName: 'Ana Pérez Mora', phone: '88887777' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('namesMatch: cuando dos nombres son la misma persona', () => {
  it.each([
    ['Juan Pérez Mora', 'juan perez mora'],
    ['Juan Pérez Mora', '  JUAN   PÉREZ  MORA '],
    ['José Núñez', 'Jose Nunez'],
  ])('"%s" y "%s" coinciden (sin mayusculas, tildes ni espacios de mas)', (a, b) => {
    expect(namesMatch(a, b)).toBe(true);
  });

  it('nombres distintos no coinciden', () => {
    expect(namesMatch('Juan Pérez Mora', 'Pedro Soto Vargas')).toBe(false);
  });
});

describe('buildPhoneLookupWhere: encuentra telefonos guardados con formato viejo', () => {
  // Antes del 26/10/2026 cancha guardaba el telefono tal como se escribia
  // ("8888-7777"). Se genera el SQL REAL que Sequelize enviaria a MySQL
  // (sin conectarse) para comprobar que compara solo los digitos.
  it('compara el telefono guardado sin guiones, espacios, parentesis ni "+"', () => {
    const sequelize = new Sequelize('db', 'user', 'pass', { dialect: 'mysql', logging: false });
    const sql = sequelize.getQueryInterface().queryGenerator.whereQuery(buildPhoneLookupWhere('88887777'));
    expect(sql).toBe(
      "WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`phone`, '-', ''), ' ', ''), '(', ''), ')', ''), '+', '')"
      + " IN ('88887777', '50688887777')",
    );
  });
});

describe('matchCustomerByPhone', () => {
  const base = { customerName: 'Pedro Soto Vargas', customerPhone: '88887777' };

  it('telefono nuevo -> null (hay que crear el cliente)', async () => {
    Customer.findAll.mockResolvedValue([]);
    await expect(matchCustomerByPhone(base)).resolves.toBeNull();
  });

  it('mismo telefono y mismo nombre -> reutiliza al cliente sin preguntar', async () => {
    Customer.findAll.mockResolvedValue([JUAN]);
    await expect(matchCustomerByPhone({ ...base, customerName: 'juan perez mora' })).resolves.toBe(JUAN);
  });

  it('BUG: mismo telefono con OTRO nombre -> 409 CUSTOMER_PHONE_CONFLICT (ya no usa a Juan en silencio)', async () => {
    Customer.findAll.mockResolvedValue([JUAN]);
    const error = await matchCustomerByPhone(base).catch((e) => e);
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe(CUSTOMER_PHONE_CONFLICT_CODE);
    expect(error.message).toMatch(/Juan Pérez Mora/);
    expect(error.details).toEqual({
      phone: '88887777',
      existingCustomers: [{ customerId: 4, fullName: 'Juan Pérez Mora' }],
    });
  });

  it('"es otra persona" (confirmNewCustomer) -> null: se creara un cliente nuevo', async () => {
    Customer.findAll.mockResolvedValue([JUAN]);
    await expect(matchCustomerByPhone({ ...base, confirmNewCustomer: true })).resolves.toBeNull();
  });

  it('"es otra persona" pero con el nombre de un cliente que ya tiene ese telefono -> reutiliza (no duplica)', async () => {
    Customer.findAll.mockResolvedValue([JUAN, ANA]);
    const result = await matchCustomerByPhone({ ...base, customerName: 'Ana Perez Mora', confirmNewCustomer: true });
    expect(result).toBe(ANA);
  });

  it('"si, es ese cliente" (linkCustomerId) -> devuelve el elegido', async () => {
    Customer.findAll.mockResolvedValue([JUAN, ANA]);
    await expect(matchCustomerByPhone({ ...base, linkCustomerId: 9 })).resolves.toBe(ANA);
  });

  it('linkCustomerId que ya no tiene ese telefono -> vuelve a preguntar con datos frescos', async () => {
    Customer.findAll.mockResolvedValue([JUAN]);
    const error = await matchCustomerByPhone({ ...base, linkCustomerId: 77 }).catch((e) => e);
    expect(error.code).toBe(CUSTOMER_PHONE_CONFLICT_CODE);
  });

  it('varios clientes con el mismo telefono -> el aviso los lista a todos', async () => {
    Customer.findAll.mockResolvedValue([JUAN, ANA]);
    const error = await matchCustomerByPhone(base).catch((e) => e);
    expect(error.details.existingCustomers.map((c) => c.customerId)).toEqual([4, 9]);
  });
});

describe('POST /api/field-bookings (cancha, HU-001) con telefono ya registrado', () => {
  const start = new Date(Date.now() + 86400000);
  const payload = {
    resourceId: 1,
    customerName: 'Pedro Soto Vargas',
    customerPhone: '8888-7777',
    startDatetime: start.toISOString(),
    endDatetime: new Date(start.getTime() + 7200000).toISOString(),
  };

  beforeEach(() => {
    Resource.findOne.mockResolvedValue({ resourceId: 1, status: 'available' });
    ResourceBlock.findOne.mockResolvedValue(null);
    Booking.findOne.mockResolvedValue(null);
    Booking.create.mockResolvedValue({ bookingId: 50, status: 'active' });
    Customer.findAll.mockResolvedValue([JUAN]);
    Customer.create.mockResolvedValue({ customerId: 12, fullName: 'Pedro Soto Vargas' });
  });

  it('BUG: responde 409 con el cliente existente y NO crea la reserva a nombre de Juan', async () => {
    const response = await request(app).post('/api/field-bookings').send(payload);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CUSTOMER_PHONE_CONFLICT');
    expect(response.body.error.details.existingCustomers).toEqual([{ customerId: 4, fullName: 'Juan Pérez Mora' }]);
    expect(Booking.create).not.toHaveBeenCalled();
    expect(Customer.create).not.toHaveBeenCalled();
  });

  it('busca con el telefono normalizado: "8888-7777" y "88887777" son el mismo numero', async () => {
    await request(app).post('/api/field-bookings').send(payload);
    expect(Customer.findAll.mock.calls[0][0].where.logic[Op.in]).toEqual(['88887777', '50688887777']);
  });

  it('"es otra persona": crea a Pedro con el mismo telefono y la reserva queda a su nombre', async () => {
    const response = await request(app).post('/api/field-bookings').send({ ...payload, confirmNewCustomer: true });
    expect(response.status).toBe(201);
    expect(Customer.create).toHaveBeenCalledWith(
      { fullName: 'Pedro Soto Vargas', phone: '88887777' },
      expect.anything(),
    );
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 12 }));
  });

  it('"si, es ese cliente": la reserva queda ligada a Juan sin crear otro cliente', async () => {
    const response = await request(app).post('/api/field-bookings').send({ ...payload, linkCustomerId: 4 });
    expect(response.status).toBe(201);
    expect(Customer.create).not.toHaveBeenCalled();
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 4 }));
  });

  it('rechaza (422) mandar las dos respuestas a la vez', async () => {
    const response = await request(app).post('/api/field-bookings')
      .send({ ...payload, linkCustomerId: 4, confirmNewCustomer: true });
    expect(response.status).toBe(422);
    expect(Booking.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/hall-bookings (salon, HU-013) con telefono ya registrado', () => {
  const start = new Date(Date.now() + 2 * 86400000);
  const payload = {
    resourceId: 2,
    planId: 1,
    customerName: 'Pedro Soto Vargas',
    customerPhone: '88887777',
    startDatetime: start.toISOString(),
    endDatetime: new Date(start.getTime() + 6 * 3600000).toISOString(),
  };

  beforeEach(() => {
    Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'available' });
    ResourceBlock.findOne.mockResolvedValue(null);
    Booking.findOne.mockResolvedValue(null);
    Booking.create.mockResolvedValue({ bookingId: 60 });
    EventHallPricingPlan.findOne.mockResolvedValue({ planId: 1, planName: 'Medio dia', hours: 6, price: 150000 });
    Customer.findAll.mockResolvedValue([JUAN]);
    Customer.create.mockResolvedValue({ customerId: 13, fullName: 'Pedro Soto Vargas' });
  });

  it('BUG: responde 409 CUSTOMER_PHONE_CONFLICT y no registra la reserva', async () => {
    const response = await request(app).post('/api/hall-bookings').send(payload);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CUSTOMER_PHONE_CONFLICT');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('"es otra persona": crea el cliente DENTRO de la transaccion de la reserva', async () => {
    const response = await request(app).post('/api/hall-bookings').send({ ...payload, confirmNewCustomer: true });
    expect(response.status).toBe(201);
    const [, options] = Customer.create.mock.calls[0];
    expect(options.transaction).toBeDefined();
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 13 }), expect.anything());
  });

  it('"si, es ese cliente": usa a Juan', async () => {
    const response = await request(app).post('/api/hall-bookings').send({ ...payload, linkCustomerId: 4 });
    expect(response.status).toBe(201);
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 4 }), expect.anything());
  });
});
