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
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));

const request = require('supertest');
const { Sequelize, Op } = require('sequelize');
const app = require('../../src/app');
const {
  Booking, Resource, ResourceBlock, Customer,
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
    // No se revela a quien pertenece el numero (evita robo de identidad).
    expect(error.message).toMatch(/no coincide/);
    expect(error.message).not.toMatch(/Juan|Pérez/);
    // Tampoco viaja ningun dato del cliente existente (ni nombre ni id).
    expect(error.details).toBeUndefined();
  });

  it('ya no hay forma de usar ni de forzar: linkCustomerId y confirmNewCustomer se ignoran', async () => {
    Customer.findAll.mockResolvedValue([JUAN]);
    const forced = await matchCustomerByPhone({ ...base, confirmNewCustomer: true }).catch((e) => e);
    expect(forced.code).toBe(CUSTOMER_PHONE_CONFLICT_CODE);
    const linked = await matchCustomerByPhone({ ...base, linkCustomerId: 4 }).catch((e) => e);
    expect(linked.code).toBe(CUSTOMER_PHONE_CONFLICT_CODE);
  });

  it('varios clientes con el mismo telefono y ninguno con ese nombre -> 409 sin datos', async () => {
    Customer.findAll.mockResolvedValue([JUAN, ANA]);
    const error = await matchCustomerByPhone(base).catch((e) => e);
    expect(error.code).toBe(CUSTOMER_PHONE_CONFLICT_CODE);
    expect(error.details).toBeUndefined();
  });

  it('varios clientes con el mismo telefono y uno con ese nombre -> reutiliza a ese', async () => {
    Customer.findAll.mockResolvedValue([JUAN, ANA]);
    await expect(matchCustomerByPhone({ ...base, customerName: 'Ana Perez Mora' })).resolves.toBe(ANA);
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

  it('BUG: responde 409 (telefono no coincide) y NO crea la reserva a nombre de Juan', async () => {
    const response = await request(app).post('/api/field-bookings').send(payload);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CUSTOMER_PHONE_CONFLICT');
    expect(response.body.error.message).toMatch(/no coincide/);
    expect(response.body.error.details).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/Juan|Pérez|customerId/);
    expect(Booking.create).not.toHaveBeenCalled();
    expect(Customer.create).not.toHaveBeenCalled();
  });

  it('busca con el telefono normalizado: "8888-7777" y "88887777" son el mismo numero', async () => {
    await request(app).post('/api/field-bookings').send(payload);
    expect(Customer.findAll.mock.calls[0][0].where.logic[Op.in]).toEqual(['88887777', '50688887777']);
  });

  it('telefono nuevo: crea a Pedro y la reserva queda a su nombre', async () => {
    Customer.findAll.mockResolvedValue([]);
    const response = await request(app).post('/api/field-bookings').send(payload);
    expect(response.status).toBe(201);
    expect(Customer.create).toHaveBeenCalledWith(
      { fullName: 'Pedro Soto Vargas', phone: '88887777' },
      expect.anything(),
    );
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 12 }));
  });

  it('no se puede ligar al cliente del numero ni forzar uno nuevo: linkCustomerId y confirmNewCustomer se ignoran', async () => {
    const linked = await request(app).post('/api/field-bookings').send({ ...payload, linkCustomerId: 4 });
    expect(linked.status).toBe(409);
    const forced = await request(app).post('/api/field-bookings').send({ ...payload, confirmNewCustomer: true });
    expect(forced.status).toBe(409);
    expect(Booking.create).not.toHaveBeenCalled();
    expect(Customer.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/hall-bookings (salon, HU-013) con telefono ya registrado', () => {
  const day = new Date(Date.now() + 2 * 86400000);
  const pad = (value) => String(value).padStart(2, '0');
  const payload = {
    resourceId: 2,
    customerName: 'Pedro Soto Vargas',
    customerPhone: '88887777',
    date: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
  };

  beforeEach(() => {
    Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'available' });
    ResourceBlock.findOne.mockResolvedValue(null);
    Booking.findOne.mockResolvedValue(null);
    Booking.create.mockResolvedValue({ bookingId: 60 });
    Customer.findAll.mockResolvedValue([JUAN]);
    Customer.create.mockResolvedValue({ customerId: 13, fullName: 'Pedro Soto Vargas' });
  });

  it('BUG: responde 409 CUSTOMER_PHONE_CONFLICT (sin revelar de quien es) y no registra la reserva', async () => {
    const response = await request(app).post('/api/hall-bookings').send(payload);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CUSTOMER_PHONE_CONFLICT');
    expect(response.body.error.message).toMatch(/no coincide/);
    expect(JSON.stringify(response.body)).not.toMatch(/Juan|Pérez|customerId/);
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('telefono nuevo: crea el cliente DENTRO de la transaccion de la reserva', async () => {
    Customer.findAll.mockResolvedValue([]);
    const response = await request(app).post('/api/hall-bookings').send(payload);
    expect(response.status).toBe(201);
    const [, options] = Customer.create.mock.calls[0];
    expect(options.transaction).toBeDefined();
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 13 }), expect.anything());
  });

  it('no se puede ligar al cliente del numero ni forzar uno nuevo (se ignoran linkCustomerId y confirmNewCustomer)', async () => {
    expect((await request(app).post('/api/hall-bookings').send({ ...payload, linkCustomerId: 4 })).status).toBe(409);
    expect((await request(app).post('/api/hall-bookings').send({ ...payload, confirmNewCustomer: true })).status).toBe(409);
    expect(Booking.create).not.toHaveBeenCalled();
  });
});
