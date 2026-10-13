'use strict';

// Horas extra del salon: el plan cubre N horas y las que sobran del horario se
// cobran a la tarifa por hora extra del plan. Archivo aparte de
// reservasSalon.service.test.js para no mezclar las pruebas de cada quien.
jest.mock('../../src/models', () => ({
  Booking: { findAndCountAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Resource: { findOne: jest.fn() },
  Customer: { findOrCreate: jest.fn() },
  EventHallPricingPlan: { findOne: jest.fn(), findAll: jest.fn() },
  ResourceBlock: { findOne: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const app = require('../../src/app');
const {
  Booking, Resource, Customer, EventHallPricingPlan, ResourceBlock,
} = require('../../src/models');
const extra = require('../../src/modules/reservasSalon/reservasSalon.extraHours.util');

const base = '/api/hall-bookings';
const HOUR = 3600000;
// "Comun": 2 horas, 50 000, hora extra 8 000. "Fijo": 2 horas, sin horas extra.
const comun = {
  planId: 1, resourceId: 2, planName: 'Comun', hours: 2, price: '50000.00', extraHourPrice: '8000.00',
};
const fijo = {
  planId: 2, resourceId: 2, planName: 'Fijo', hours: 2, price: '40000.00', extraHourPrice: null,
};
let start;
const endAfter = (hours) => new Date(start.getTime() + hours * HOUR).toISOString();
const payload = (over = {}) => ({
  resourceId: 2, planId: 1, customerName: 'Kendall', customerPhone: '88888888',
  startDatetime: start.toISOString(), endDatetime: endAfter(2), ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  start = new Date(Date.now() + 86400000);
  Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'available' });
  ResourceBlock.findOne.mockResolvedValue(null);
  Booking.findOne.mockResolvedValue(null);
  Customer.findOrCreate.mockResolvedValue([{ customerId: 4 }]);
  Booking.create.mockImplementation(async (values) => ({ bookingId: 9, ...values }));
  EventHallPricingPlan.findOne.mockImplementation(async ({ where }) => [comun, fijo].find((plan) => plan.planId === where.planId));
  EventHallPricingPlan.findAll.mockResolvedValue([comun, fijo]);
});

describe('util de horas extra', () => {
  const s = new Date('2026-10-20T09:00:00Z');
  const at = (hours) => new Date(s.getTime() + hours * HOUR);

  it('cuenta las horas completas y cuantas faltan para cubrir el horario', () => {
    expect(extra.bookedHours(s, at(2))).toBe(2);
    expect(extra.bookedHours(s, at(2.5))).toBe(3);
    expect(extra.requiredExtraHours(comun, s, at(1))).toBe(0);
    expect(extra.requiredExtraHours(comun, s, at(2))).toBe(0);
    expect(extra.requiredExtraHours(comun, s, at(2.5))).toBe(1);
    expect(extra.requiredExtraHours(comun, s, at(5))).toBe(3);
  });

  it('calcula el costo de las horas extra y el total', () => {
    expect(extra.extraHoursCost(comun, 3)).toBe(24000);
    expect(extra.totalPrice(comun, 3)).toBe(74000);
    expect(extra.totalPrice(comun, 0)).toBe(50000);
    expect(extra.extraHoursCost(fijo, 2)).toBe(0);
  });

  it('parseExtraHours: vacio es 0 y lo no entero es NaN', () => {
    expect(extra.parseExtraHours(undefined)).toBe(0);
    expect(extra.parseExtraHours(null)).toBe(0);
    expect(extra.parseExtraHours('')).toBe(0);
    expect(extra.parseExtraHours('3')).toBe(3);
    expect(extra.parseExtraHours(2)).toBe(2);
    expect(Number.isNaN(extra.parseExtraHours(1.5))).toBe(true);
    expect(Number.isNaN(extra.parseExtraHours('x'))).toBe(true);
    expect(Number.isNaN(extra.parseExtraHours(true))).toBe(true);
  });
});

describe('registrar una reserva con horas extra', () => {
  it('dentro de las horas del plan: sin horas extra, igual que antes', async () => {
    const result = await request(app).post(base).send(payload());
    expect(result.status).toBe(201);
    expect(Booking.create.mock.calls[0][0].extraHours).toBe(0);
    expect(result.body.data).toMatchObject({
      extraHours: 0, extraHoursCost: 0, totalPrice: 50000, depositAmount: 15000,
    });
  });

  it('un horario de 5 h en un plan de 2 h con 3 horas extra suma al total y al anticipo', async () => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(5), extraHours: 3 }));
    expect(result.status).toBe(201);
    expect(Booking.create.mock.calls[0][0].extraHours).toBe(3);
    expect(result.body.data).toMatchObject({
      extraHours: 3, extraHoursCost: 24000, totalPrice: 74000, depositAmount: 22200, depositPercentage: 0.3,
      plan: { planId: 1, price: 50000, extraHourPrice: 8000 },
    });
  });

  it('acepta las horas extra como texto', async () => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(3), extraHours: '1' }));
    expect(result.status).toBe(201);
    expect(result.body.data.totalPrice).toBe(58000);
  });

  it('el horario pasa del plan y no declaran horas extra: se rechaza diciendo cuantas faltan', async () => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(5) }));
    expect(result.status).toBe(422);
    expect(result.body.error.message).toBe('El horario dura 5 horas y el plan "Comun" cubre 2: agregá 3 horas extra.');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('singular: falta una hora extra', async () => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(3) }));
    expect(result.body.error.message).toBe('El horario dura 3 horas y el plan "Comun" cubre 2: agregá 1 hora extra.');
  });

  it('declaran menos horas extra de las necesarias', async () => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(5), extraHours: 1 }));
    expect(result.status).toBe(422);
    expect(result.body.error.message).toContain('agregá 3 horas extra');
  });

  it('declaran mas horas extra de las que el horario necesita', async () => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(3), extraHours: 4 }));
    expect(result.status).toBe(422);
    expect(result.body.error.message).toBe('El horario solo supera el plan por 1 hora: no se pueden cobrar 4 horas extra.');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('horas extra sin que el horario pase del plan', async () => {
    const result = await request(app).post(base).send(payload({ extraHours: 1 }));
    expect(result.status).toBe(422);
    expect(result.body.error.message).toBe('El horario no supera las horas del plan: no hay horas extra que cobrar.');
  });

  it('un plan sin costo por hora extra no admite horas extra y lo dice', async () => {
    const result = await request(app).post(base).send(payload({ planId: 2, endDatetime: endAfter(4), extraHours: 2 }));
    expect(result.status).toBe(422);
    expect(result.body.error.message).toBe('El plan "Fijo" no admite horas extra. Elegí un plan más largo o acortá el horario.');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('un plan sin horas extra tampoco deja pasarse del horario sin declararlas', async () => {
    const result = await request(app).post(base).send(payload({ planId: 2, endDatetime: endAfter(4) }));
    expect(result.status).toBe(422);
    expect(result.body.error.message).toContain('Este plan no admite horas extra');
  });

  it.each([-1, 25, 1.5, 'abc'])('rechaza horas extra %j por formato', async (extraHours) => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(3), extraHours }));
    expect(result.status).toBe(422);
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('el error de horas extra marca el campo extraHours', async () => {
    const result = await request(app).post(base).send(payload({ endDatetime: endAfter(5) }));
    expect(result.body.error.details).toEqual([{ field: 'extraHours', message: result.body.error.message }]);
  });
});

describe('modificar una reserva con horas extra', () => {
  let booking;
  beforeEach(() => {
    booking = {
      bookingId: 8, resourceId: 2, customerId: 4, eventHallPlanId: 1, extraHours: 0,
      startDatetime: start, endDatetime: new Date(start.getTime() + 2 * HOUR), status: 'active', originChannel: 'staff',
      resource: { resourceId: 2, name: 'Salon' }, customer: { customerId: 4, fullName: 'Kendall', phone: '88888888' },
      eventHallPlan: comun, save: jest.fn(async () => {}),
    };
    Booking.findByPk.mockResolvedValue(booking);
    Booking.findOne.mockImplementation(async (options) => (options.include ? booking : null));
  });

  it('alargar el horario sin horas extra se rechaza', async () => {
    const result = await request(app).patch(`${base}/8`).send({ endDatetime: endAfter(4) });
    expect(result.status).toBe(422);
    expect(result.body.error.message).toContain('agregá 2 horas extra');
    expect(booking.save).not.toHaveBeenCalled();
  });

  it('alargar el horario declarando las horas extra las guarda y calcula los importes', async () => {
    const result = await request(app).patch(`${base}/8`).send({ endDatetime: endAfter(4), extraHours: 2 });
    expect(result.status).toBe(200);
    expect(booking.extraHours).toBe(2);
    expect(booking.save).toHaveBeenCalledWith({ fields: ['startDatetime', 'endDatetime', 'extraHours'], transaction: expect.any(Object) });
    expect(result.body.data.pricing).toEqual({
      price: 66000, depositPercentage: 0.3, depositAmount: 19800, previousDepositAmount: 15000, depositDifference: 4800,
      extraHours: 2, extraHoursCost: 16000,
    });
  });

  it('quitar el tiempo sobrante sin bajar las horas extra se rechaza', async () => {
    booking.extraHours = 2;
    booking.endDatetime = new Date(start.getTime() + 4 * HOUR);
    const result = await request(app).patch(`${base}/8`).send({ endDatetime: endAfter(2) });
    expect(result.status).toBe(422);
    expect(result.body.error.message).toBe('El horario no supera las horas del plan: no hay horas extra que cobrar.');
  });

  it('cambiar a un plan mas corto exige horas extra para el mismo horario', async () => {
    booking.endDatetime = new Date(start.getTime() + 3 * HOUR);
    const shorter = { ...comun, planId: 3, planName: 'Corto', hours: 1, price: '20000.00', extraHourPrice: '5000.00' };
    EventHallPricingPlan.findAll.mockResolvedValue([comun, fijo, shorter]);
    const rejected = await request(app).patch(`${base}/8`).send({ planId: 3 });
    expect(rejected.status).toBe(422);
    const accepted = await request(app).patch(`${base}/8`).send({ planId: 3, extraHours: 2 });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.pricing).toMatchObject({ price: 30000, extraHours: 2, extraHoursCost: 10000 });
  });

  it('sin tocar horas extra, una reserva anterior dentro del plan se edita igual que antes', async () => {
    const result = await request(app).patch(`${base}/8`).send({ endDatetime: endAfter(1) });
    expect(result.status).toBe(200);
    expect(booking.save).toHaveBeenCalledWith({ fields: ['startDatetime', 'endDatetime'], transaction: expect.any(Object) });
    expect(result.body.data.pricing).toBeUndefined();
  });

  it('el detalle y el listado traen horas extra y su costo', async () => {
    booking.extraHours = 2;
    booking.endDatetime = new Date(start.getTime() + 4 * HOUR);
    Booking.findAndCountAll.mockResolvedValue({ rows: [booking], count: 1 });
    const list = await request(app).get(base);
    expect(list.body.data[0]).toMatchObject({ extraHours: 2, extraHoursCost: 16000, plan: { extraHourPrice: 8000 } });
    const detail = await request(app).get(`${base}/8`);
    expect(detail.body.data).toMatchObject({ extraHours: 2, extraHoursCost: 16000 });
    expect(detail.body.data.availablePlans.map((plan) => plan.extraHourPrice)).toEqual([8000, null]);
  });

  it('rechaza horas extra con formato invalido', async () => {
    expect((await request(app).patch(`${base}/8`).send({ extraHours: -1 })).status).toBe(422);
    expect((await request(app).patch(`${base}/8`).send({ extraHours: 'x' })).status).toBe(422);
    expect(booking.save).not.toHaveBeenCalled();
  });
});
