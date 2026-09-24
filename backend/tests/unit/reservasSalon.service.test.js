'use strict';

jest.mock('../../src/models', () => ({
  Booking: { findAndCountAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Resource: { findOne: jest.fn() },
  Customer: { findOrCreate: jest.fn() },
  EventHallPricingPlan: { findOne: jest.fn(), findAll: jest.fn() },
  ResourceBlock: { findOne: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../../src/app');
const { Booking, Resource, Customer, EventHallPricingPlan, ResourceBlock } = require('../../src/models');
const base = '/api/hall-bookings';
let booking;
let start;
let end;
const plans = [
  { planId: 1, resourceId: 2, planName: 'Medio dia', hours: 6, price: '150000.00' },
  { planId: 2, resourceId: 2, planName: 'Dia completo', hours: 12, price: '250000.00' },
];

beforeEach(() => {
  jest.clearAllMocks();
  start = new Date(Date.now() + 86400000);
  end = new Date(start.getTime() + 7200000);
  booking = {
    bookingId: 8, resourceId: 2, customerId: 4, eventHallPlanId: 1,
    startDatetime: start, endDatetime: end, status: 'active', originChannel: 'web',
    resource: { resourceId: 2, name: 'Salon' },
    customer: { customerId: 4, fullName: 'Kendall', phone: '88888888', passwordHash: 'private' },
    eventHallPlan: plans[0], save: jest.fn().mockImplementation(async () => { booking.eventHallPlan = plans.find((plan) => plan.planId === booking.eventHallPlanId); }),
  };
  Booking.findByPk.mockResolvedValue(booking);
  Booking.findOne.mockImplementation(async (options) => options.include ? booking : null);
  Booking.findAndCountAll.mockResolvedValue({ rows: [booking], count: 1 });
  Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'available' });
  ResourceBlock.findOne.mockResolvedValue(null);
  EventHallPricingPlan.findAll.mockResolvedValue(plans);
});

describe('HU-014 consultas de reservas del salon', () => {
  it('lista solo event_hall con paginacion, cliente, plan, estado y origen', async () => {
    const result = await request(app).get(`${base}?page=2&pageSize=5`);
    expect(result.status).toBe(200);
    expect(result.body.meta).toMatchObject({ page: 2, pageSize: 5, total: 1 });
    expect(result.body.data[0]).toMatchObject({ bookingId: 8, customer: { fullName: 'Kendall', phone: '88888888' }, plan: { planId: 1 }, status: 'active', originChannel: 'web' });
    expect(result.body.data[0].customer.passwordHash).toBeUndefined();
    expect(Booking.findAndCountAll.mock.calls[0][0]).toMatchObject({ limit: 5, offset: 5, include: expect.arrayContaining([expect.objectContaining({ required: true, where: { resourceType: 'event_hall' } })]) });
  });
  it('devuelve lista vacia sin error', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const result = await request(app).get(base);
    expect(result.body).toMatchObject({ data: [], meta: { total: 0 } });
  });
  it('carga por ID y restringe el tipo de recurso', async () => {
    const result = await request(app).get(`${base}/8`);
    expect(result.status).toBe(200);
    expect(result.body.data.bookingId).toBe(8);
    expect(Booking.findOne.mock.calls[0][0]).toMatchObject({ where: { bookingId: '8' }, include: expect.arrayContaining([expect.objectContaining({ where: { resourceType: 'event_hall' } })]) });
  });
  it('detalle inexistente devuelve 404', async () => {
    Booking.findOne.mockResolvedValue(null);
    expect((await request(app).get(`${base}/99`)).status).toBe(404);
  });
  it.each(['page=0', 'pageSize=101', 'page=x'])('rechaza paginacion %s', async (query) => {
    expect((await request(app).get(`${base}?${query}`)).status).toBe(422);
  });
});

describe('HU-014 modificar fechas', () => {
  it('actualiza solo fechas conservando cliente, recurso, plan, estado y origen web', async () => {
    const newEnd = new Date(end.getTime() + 3600000).toISOString();
    const result = await request(app).patch(`${base}/8`).send({ endDatetime: newEnd });
    expect(result.status).toBe(200);
    expect(result.body.data.endDatetime).toBe(newEnd);
    expect(booking).toMatchObject({ resourceId: 2, customerId: 4, eventHallPlanId: 1, status: 'active', originChannel: 'web', startDatetime: start });
    expect(booking.save).toHaveBeenCalledWith({ fields: ['startDatetime', 'endDatetime'], transaction: expect.any(Object) });
    expect(Customer.findOrCreate).not.toHaveBeenCalled();
  });
  it('excluye la propia reserva y usa limites de solapamiento estrictos', async () => {
    expect((await request(app).patch(`${base}/8`).send({ startDatetime: start.toISOString(), endDatetime: end.toISOString() })).status).toBe(200);
    const query = Booking.findOne.mock.calls.find(([options]) => !options.include)[0];
    expect(query.where.bookingId[Op.ne]).toBe(8);
    expect(query.where.startDatetime[Op.lt]).toEqual(end);
    expect(query.where.endDatetime[Op.gt]).toEqual(start);
    expect(query.where.status[Op.in]).toEqual(['pending', 'active', 'checked_in']);
  });
  it.each(['booking', 'block'])('rechaza conflicto %s sin guardar', async (type) => {
    if (type === 'booking') Booking.findOne.mockResolvedValue({ bookingId: 99 });
    else ResourceBlock.findOne.mockResolvedValue({ blockId: 2 });
    expect((await request(app).patch(`${base}/8`).send({ endDatetime: end.toISOString() })).status).toBe(409);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it('rechaza reserva cancelada', async () => {
    booking.status = 'cancelled';
    expect((await request(app).patch(`${base}/8`).send({ endDatetime: end.toISOString() })).status).toBe(409);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it.each(['missing', 'otherResource'])('rechaza reserva %s con 404', async (type) => {
    if (type === 'missing') Booking.findByPk.mockResolvedValue(null);
    else Resource.findOne.mockResolvedValue(null);
    expect((await request(app).patch(`${base}/8`).send({ endDatetime: end.toISOString() })).status).toBe(404);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it.each([{}, { customerId: 5 }, { resourceId: 3 }, { status: 'active' }, { originChannel: 'staff' }, { planId: 0 }, { planId: null }, { planId: 'abc' }, { startDatetime: null }, { startDatetime: '2026-02-30T12:00:00Z' }, { endDatetime: 'invalid' }, { startDatetime: '2026-09-25' }])('rechaza body invalido %j', async (body) => {
    expect((await request(app).patch(`${base}/8`).send(body)).status).toBe(422);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', 'abc'])('valida ID %s en lectura y escritura', async (id) => {
    expect((await request(app).get(`${base}/${id}`)).status).toBe(422);
    expect((await request(app).patch(`${base}/${id}`).send({ endDatetime: end.toISOString() })).status).toBe(422);
  });
  it('rechaza fin anterior al inicio, pasado y mas de 30 dias', async () => {
    for (const body of [
      { endDatetime: new Date(start.getTime() - 1).toISOString() },
      { startDatetime: new Date(Date.now() - 86400000).toISOString() },
      { startDatetime: new Date(Date.now() + 32 * 86400000).toISOString(), endDatetime: new Date(Date.now() + 33 * 86400000).toISOString() },
    ]) expect((await request(app).patch(`${base}/8`).send(body)).status).toBe(422);
    expect(booking.save).not.toHaveBeenCalled();
  });
});

describe('HU-014 CA-3 cambio de plan sin integracion financiera', () => {
  it('cambia plan y calcula requerimientos conservando datos originales', async () => {
    const result = await request(app).patch(`${base}/8`).send({ planId: 2 });
    expect(result.status).toBe(200);
    expect(result.body.data.plan.planId).toBe(2);
    expect(result.body.data.pricing).toEqual({ price: 250000, depositPercentage: 0.3, depositAmount: 75000, previousDepositAmount: 45000, depositDifference: 30000 });
    expect(booking).toMatchObject({ eventHallPlanId: 2, resourceId: 2, customerId: 4, status: 'active', originChannel: 'web', startDatetime: start, endDatetime: end });
    expect(booking.save).toHaveBeenCalledWith({ fields: ['startDatetime', 'endDatetime', 'eventHallPlanId'], transaction: expect.any(Object) });
    expect(result.body.data).not.toHaveProperty('balance');
    expect(Customer.findOrCreate).not.toHaveBeenCalled();
  });
  it.each([99, 3])('rechaza plan inexistente o de otro salon (%s)', async (planId) => {
    const catalog = [...plans, { planId: 3, resourceId: 9, price: '300000.00' }];
    EventHallPricingPlan.findAll.mockImplementation(async ({ where }) => catalog.filter((plan) => plan.resourceId === where.resourceId));
    expect((await request(app).patch(`${base}/8`).send({ planId })).status).toBe(404);
    expect(booking.save).not.toHaveBeenCalled();
    expect(booking.eventHallPlanId).toBe(1);
  });
  it('modifica plan y horario juntos', async () => {
    const newEnd = new Date(end.getTime() + 3600000).toISOString();
    const result = await request(app).patch(`${base}/8`).send({ planId: 2, endDatetime: newEnd });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ plan: { planId: 2 }, endDatetime: newEnd });
  });
  it('conflicto impide guardar tambien el cambio de plan', async () => {
    ResourceBlock.findOne.mockResolvedValue({ blockId: 1 });
    expect((await request(app).patch(`${base}/8`).send({ planId: 2 })).status).toBe(409);
    expect(booking.eventHallPlanId).toBe(1);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it('plan mas barato devuelve diferencia negativa, no un reembolso', async () => {
    booking.eventHallPlanId = 2;
    const result = await request(app).patch(`${base}/8`).send({ planId: 1 });
    expect(result.body.data.pricing.depositDifference).toBe(-30000);
  });
  it('mismo plan devuelve diferencia cero', async () => {
    const result = await request(app).patch(`${base}/8`).send({ planId: 1 });
    expect(result.body.data.pricing.depositDifference).toBe(0);
  });
  it('detalle entrega planes del mismo salon con precios actuales', async () => {
    const result = await request(app).get(`${base}/8`);
    expect(result.body.data.availablePlans).toHaveLength(2);
    expect(result.body.data.availablePlans[1].price).toBe(250000);
    expect(EventHallPricingPlan.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { resourceId: 2 } }));
  });
});

describe('HU-015 cancelar reservas del salon', () => {
  it('cancela sin motivo y conserva todos los datos de la reserva', async () => {
    const result = await request(app).post(`${base}/8/cancel`);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ bookingId: 8, status: 'cancelled' });
    expect(booking).toMatchObject({ customerId: 4, resourceId: 2, eventHallPlanId: 1, startDatetime: start, endDatetime: end, originChannel: 'web' });
    expect(booking.save).toHaveBeenCalledWith({ fields: ['status'], transaction: expect.any(Object) });
    expect(Booking.findByPk).toHaveBeenCalledWith('8', expect.objectContaining({ lock: 'UPDATE' }));
    expect(Resource.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { resourceId: 2, resourceType: 'event_hall' } }));
  });
  it('acepta motivo opcional y lo recorta', async () => {
    const result = await request(app).post(`${base}/8/cancel`).send({ cancellationReason: '  Cliente desiste  ' });
    expect(result.status).toBe(200);
    expect(result.body.data.cancellationReason).toBe('Cliente desiste');
    expect(booking.save).toHaveBeenCalledWith({ fields: ['status', 'cancellationReason'], transaction: expect.any(Object) });
  });
  it.each([{}, { cancellationReason: '' }, { cancellationReason: 'a'.repeat(250) }])('acepta cuerpo %j', async (body) => {
    expect((await request(app).post(`${base}/8/cancel`).send(body)).status).toBe(200);
  });
  it.each([{ cancellationReason: 'a'.repeat(251) }, { cancellationReason: 7 }, { cancellationReason: null }, { status: 'cancelled' }, { resourceId: 2 }])('rechaza cuerpo %j', async (body) => {
    expect((await request(app).post(`${base}/8/cancel`).send(body)).status).toBe(422);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', 'abc'])('rechaza ID %s', async (id) => {
    expect((await request(app).post(`${base}/${id}/cancel`)).status).toBe(422);
    expect(Booking.findByPk).not.toHaveBeenCalled();
  });
  it.each(['missing', 'otherModule'])('reserva %s devuelve 404', async (type) => {
    if (type === 'missing') Booking.findByPk.mockResolvedValue(null);
    else Resource.findOne.mockResolvedValue(null);
    expect((await request(app).post(`${base}/8/cancel`)).status).toBe(404);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it('reserva ya cancelada devuelve 409 sin guardar', async () => {
    booking.status = 'cancelled';
    expect((await request(app).post(`${base}/8/cancel`)).status).toBe(409);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it('la segunda cancelacion no sobrescribe el motivo ni repite efectos', async () => {
    expect((await request(app).post(`${base}/8/cancel`).send({ cancellationReason: 'Original' })).status).toBe(200);
    expect((await request(app).post(`${base}/8/cancel`).send({ cancellationReason: 'Otro' })).status).toBe(409);
    expect(booking.save).toHaveBeenCalledTimes(1);
    expect(booking.cancellationReason).toBe('Original');
  });
  it('permite cancelar aunque el recurso este en mantenimiento', async () => {
    Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'maintenance' });
    expect((await request(app).post(`${base}/8/cancel`)).status).toBe(200);
  });
  it('tras cancelar, disponibilidad excluye esa reserva y edicion la rechaza', async () => {
    await request(app).post(`${base}/8/cancel`);
    Booking.findOne.mockImplementation(async ({ where }) => where.status?.[Op.in]?.includes(booking.status) ? booking : null);
    const available = await request(app).get(`${base}/availability`).query({ resourceId: 2, startDatetime: start.toISOString(), endDatetime: end.toISOString() });
    expect(available.body.data.available).toBe(true);
    expect((await request(app).patch(`${base}/8`).send({ endDatetime: end.toISOString() })).status).toBe(409);
  });
});

describe('regresion HU-007 y HU-013', () => {
  it('mantiene la ruta estatica de disponibilidad', async () => {
    const result = await request(app).get(`${base}/availability`).query({ resourceId: 2, startDatetime: start.toISOString(), endDatetime: end.toISOString() });
    expect(result.status).toBe(200);
    expect(result.body.data.available).toBe(true);
  });
  it('mantiene creacion y calculo de anticipo', async () => {
    EventHallPricingPlan.findOne.mockResolvedValue({ planId: 1, planName: 'Medio dia', hours: 6, price: 150000 });
    Customer.findOrCreate.mockResolvedValue([{ customerId: 4 }]);
    Booking.create.mockResolvedValue({ bookingId: 9 });
    const result = await request(app).post(base).send({ resourceId: 2, planId: 1, customerName: 'Kendall', customerPhone: '88888888', startDatetime: start.toISOString(), endDatetime: end.toISOString() });
    expect(result.status).toBe(201);
    expect(result.body.data.depositAmount).toBe(45000);
  });
});
