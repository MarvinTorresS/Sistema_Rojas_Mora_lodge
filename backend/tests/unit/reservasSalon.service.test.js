'use strict';

// Reservas del salon de eventos POR DIA (HU-007, HU-013, HU-014, HU-015).
// El salon se reserva como un hotel: hora de entrada y de salida fijas
// (15:00 y 20:00 por defecto), un solo cliente por dia, sin planes de precio,
// horas extra ni anticipo. Se mockea la capa de modelos (sin MySQL).

jest.mock('../../src/models', () => ({
  AuditLog: { create: jest.fn(), findAll: jest.fn(async () => []) },
  Booking: { findAndCountAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Resource: { findOne: jest.fn() },
  // Telefono nuevo por defecto (findAll vacio): el cliente se crea.
  Customer: { findAll: jest.fn(async () => []), create: jest.fn() },
  ResourceBlock: { findOne: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../../src/app');
const { Booking, Resource, Customer, ResourceBlock } = require('../../src/models');
const service = require('../../src/modules/reservasSalon/reservasSalon.service');
const { hallDayWindow, localIsoDate, hallSchedule } = require('../../src/modules/reservasSalon/reservasSalon.schedule.util');

const base = '/api/hall-bookings';
const pad = (value) => String(value).padStart(2, '0');
// yyyy-mm-dd local de hoy + offset dias.
const isoDay = (offset = 0) => {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
};
let booking;
let date;
let otherDate;
let start;
let end;

beforeEach(() => {
  jest.clearAllMocks();
  date = isoDay(2);
  otherDate = isoDay(3);
  ({ start, end } = hallDayWindow(date));
  booking = {
    bookingId: 8, resourceId: 2, customerId: 4,
    startDatetime: start, endDatetime: end, status: 'active', originChannel: 'web',
    resource: { resourceId: 2, name: 'Salon' },
    customer: { customerId: 4, fullName: 'Kendall', phone: '88888888', passwordHash: 'private' },
    save: jest.fn().mockResolvedValue(undefined),
  };
  Booking.findByPk.mockResolvedValue(booking);
  // Con include = lectura de la reserva; sin include = busqueda de conflictos.
  Booking.findOne.mockImplementation(async (options) => (options.include ? booking : null));
  Booking.findAndCountAll.mockResolvedValue({ rows: [booking], count: 1 });
  Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'available' });
  ResourceBlock.findOne.mockResolvedValue(null);
});

describe('horario fijo del salon (reserva por dia)', () => {
  it('por defecto la entrada es a las 15:00 y la salida a las 20:00', () => {
    expect(hallSchedule()).toEqual({ checkInTime: '15:00', checkOutTime: '20:00' });
    const window = hallDayWindow('2030-03-05');
    expect(window.start).toEqual(new Date(2030, 2, 5, 15, 0));
    expect(window.end).toEqual(new Date(2030, 2, 5, 20, 0));
    expect(window.dayStart).toEqual(new Date(2030, 2, 5, 0, 0));
    expect(window.dayEnd).toEqual(new Date(2030, 2, 6, 0, 0));
    expect(localIsoDate(window.start)).toBe('2030-03-05');
  });

  it('GET /schedule entrega la entrada y la salida (antes que /:bookingId)', async () => {
    const result = await request(app).get(`${base}/schedule`);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ checkInTime: '15:00', checkOutTime: '20:00' });
  });
});

describe('HU-007 disponibilidad del salon por dia', () => {
  const query = (params = {}) => request(app).get(`${base}/availability`).query({ resourceId: 2, date, ...params });

  it('dia libre: disponible, con la entrada y la salida', async () => {
    const result = await query();
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ available: true, reason: null, checkInTime: '15:00', checkOutTime: '20:00' });
  });

  it('busca reservas que toquen CUALQUIER hora del dia (no se cruzan clientes)', async () => {
    await query();
    const where = Booking.findOne.mock.calls[0][0].where;
    expect(where.resourceId).toBe('2');
    expect(where.startDatetime[Op.lt]).toEqual(hallDayWindow(date).dayEnd);
    expect(where.endDatetime[Op.gt]).toEqual(hallDayWindow(date).dayStart);
    expect(where.status[Op.in]).toEqual(['pending', 'active', 'checked_in']);
  });

  it.each([['active', 'ya tiene una reserva confirmada ese dia'], ['pending', 'tiene una solicitud pendiente de aprobacion ese dia']])(
    'dia con reserva %s: no disponible', async (status, text) => {
      Booking.findOne.mockResolvedValue({ bookingId: 5, status });
      const result = await query();
      expect(result.body.data).toMatchObject({ available: false, reason: `El salon ${text}.` });
    },
  );

  it('dia bloqueado o salon en mantenimiento: no disponible', async () => {
    ResourceBlock.findOne.mockResolvedValue({ reason: 'Pintura' });
    expect((await query()).body.data).toMatchObject({ available: false, reason: 'El salon esta bloqueado ese dia (Pintura).' });
    ResourceBlock.findOne.mockResolvedValue(null);
    Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'maintenance' });
    expect((await query()).body.data.available).toBe(false);
  });

  it('salon inexistente: 404', async () => {
    Resource.findOne.mockResolvedValue(null);
    expect((await query()).status).toBe(404);
  });

  it.each([
    ['fecha pasada', () => isoDay(-1)],
    ['mas de 30 dias', () => isoDay(31)],
  ])('rechaza %s con 422', async (_name, make) => {
    const result = await query({ date: make() });
    expect(result.status).toBe(422);
    expect(Booking.findOne).not.toHaveBeenCalled();
  });

  it.each([{ date: '2026-02-30' }, { date: 'hoy' }, { date: '' }, { date: '20-11-2026' }])('rechaza la fecha %j con 422', async (params) => {
    expect((await query(params)).status).toBe(422);
  });

  it('ya no se aceptan horas: sin date no hay consulta', async () => {
    const result = await request(app).get(`${base}/availability`)
      .query({ resourceId: 2, startDatetime: start.toISOString(), endDatetime: end.toISOString() });
    expect(result.status).toBe(422);
  });

  describe('anticipacion minima de un dia', () => {
    const fakeNow = (hour) => jest.useFakeTimers({
      now: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), hour, 0),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'],
    });
    afterEach(() => jest.useRealTimers());

    it.each([6, 10, 21])('hoy no se puede consultar ni a las %i h (422)', async (hour) => {
      fakeNow(hour);
      await expect(service.checkHallAvailability({ resourceId: 2, date: isoDay(0) })).rejects.toMatchObject({ statusCode: 422 });
    });
    it('manana es el primer dia que se puede consultar', async () => {
      fakeNow(10);
      await expect(service.checkHallAvailability({ resourceId: 2, date: isoDay(1) })).resolves.toMatchObject({ available: true });
    });
    it('hoy no se puede registrar una reserva', async () => {
      fakeNow(8);
      await expect(service.createHallBooking({ resourceId: 2, customerName: 'Ana Mora', customerPhone: '8888-8888', date: isoDay(0) }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(Booking.create).not.toHaveBeenCalled();
    });
    it('el minimo es 1 dia', () => {
      expect(service.MIN_ADVANCE_BOOKING_DAYS).toBe(1);
    });
  });
});

describe('HU-013 registrar la reserva del dia', () => {
  const payload = () => ({ resourceId: 2, customerName: 'Kendall Mora', customerPhone: '8888-8888', date });
  const post = (body = payload()) => request(app).post(base).send(body);
  beforeEach(() => {
    Customer.create.mockResolvedValue({ customerId: 4 });
    Booking.create.mockResolvedValue({ bookingId: 9 });
  });

  it('crea la reserva con la entrada (15:00) y la salida (20:00) del dia, activa y sin plan', async () => {
    const result = await post();
    expect(result.status).toBe(201);
    expect(Booking.create).toHaveBeenCalledWith({
      resourceId: 2, customerId: 4, originChannel: 'staff', startDatetime: start, endDatetime: end, status: 'active',
    }, expect.any(Object));
    expect(result.body.data).toMatchObject({ booking: { bookingId: 9 }, date, checkInTime: '15:00', checkOutTime: '20:00' });
  });

  it('no calcula ni devuelve plan, horas extra, precio ni anticipo', async () => {
    const result = await post();
    for (const key of ['plan', 'extraHours', 'extraHoursCost', 'totalPrice', 'depositAmount', 'depositPercentage']) {
      expect(result.body.data).not.toHaveProperty(key);
    }
    expect(Booking.create.mock.calls[0][0]).not.toHaveProperty('eventHallPlanId');
  });

  it('el horario lo fija el servidor: ignora horas o plan que mande el cliente', async () => {
    const result = await post({ ...payload(), planId: 3, startDatetime: '2030-01-01T01:00:00Z', endDatetime: '2030-01-01T02:00:00Z', extraHours: 4 });
    expect(result.status).toBe(201);
    expect(Booking.create.mock.calls[0][0]).toMatchObject({ startDatetime: start, endDatetime: end });
  });

  it('otro cliente el mismo dia (a cualquier hora): 409 y no se crea nada', async () => {
    Booking.findOne.mockResolvedValue({ bookingId: 5 });
    const result = await post();
    expect(result.status).toBe(409);
    expect(result.body.error.message).toContain('ya tiene una reserva ese dia');
    expect(Booking.create).not.toHaveBeenCalled();
    expect(Customer.create).not.toHaveBeenCalled();
    const where = Booking.findOne.mock.calls[0][0].where;
    expect(where.startDatetime[Op.lt]).toEqual(hallDayWindow(date).dayEnd);
    expect(where.endDatetime[Op.gt]).toEqual(hallDayWindow(date).dayStart);
  });

  it('el dia siguiente al de otro cliente si se puede reservar', async () => {
    Booking.findOne.mockImplementation(async ({ where }) => (
      where.startDatetime[Op.lt] > hallDayWindow(date).dayStart && where.endDatetime[Op.gt] < hallDayWindow(date).dayEnd ? { bookingId: 5 } : null
    ));
    expect((await post({ ...payload(), date: otherDate })).status).toBe(201);
  });

  it('bloqueo del salon dentro del horario: 409', async () => {
    ResourceBlock.findOne.mockResolvedValue({ reason: 'Mantenimiento' });
    const result = await post();
    expect(result.status).toBe(409);
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('salon inexistente 404, en mantenimiento 409', async () => {
    Resource.findOne.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'maintenance' });
    expect((await post()).status).toBe(409);
  });

  it.each([
    ['fecha pasada', () => isoDay(-1)],
    ['mas de 30 dias', () => isoDay(31)],
  ])('rechaza %s con 422', async (_name, make) => {
    expect((await post({ ...payload(), date: make() })).status).toBe(422);
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it.each([
    ['sin fecha', { date: undefined }],
    ['fecha invalida', { date: '2026-02-30' }],
    ['sin nombre', { customerName: '' }],
    ['telefono invalido', { customerPhone: '123' }],
    ['sin salon', { resourceId: undefined }],
  ])('rechaza el cuerpo %s con 422', async (_name, changes) => {
    expect((await post({ ...payload(), ...changes })).status).toBe(422);
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('ya no exige planId', async () => {
    const body = payload();
    expect(body).not.toHaveProperty('planId');
    expect((await post(body)).status).toBe(201);
  });
});

describe('HU-014 consultas de reservas del salon', () => {
  it('lista solo event_hall con paginacion, cliente, dia, estado y origen (sin plan)', async () => {
    const result = await request(app).get(`${base}?page=2&pageSize=5`);
    expect(result.status).toBe(200);
    expect(result.body.meta).toMatchObject({ page: 2, pageSize: 5, total: 1 });
    expect(result.body.data[0]).toMatchObject({
      bookingId: 8, date, customer: { fullName: 'Kendall', phone: '88888888' }, status: 'active', originChannel: 'web',
    });
    for (const key of ['plan', 'extraHours', 'extraHoursCost']) expect(result.body.data[0]).not.toHaveProperty(key);
    expect(result.body.data[0].customer.passwordHash).toBeUndefined();
    expect(Booking.findAndCountAll.mock.calls[0][0]).toMatchObject({ limit: 5, offset: 5, include: expect.arrayContaining([expect.objectContaining({ required: true, where: { resourceType: 'event_hall' } })]) });
  });
  it('filtra por dia local y por rango [dateFrom, dateBefore) como la cancha', async () => {
    await request(app).get(`${base}?date=2026-10-13`);
    let where = Booking.findAndCountAll.mock.calls.at(-1)[0].where;
    expect(where.startDatetime[Op.gte]).toEqual(new Date(2026, 9, 13));
    expect(where.startDatetime[Op.lt]).toEqual(new Date(2026, 9, 14));
    await request(app).get(`${base}?dateFrom=2026-10-13&dateBefore=2026-10-20`);
    where = Booking.findAndCountAll.mock.calls.at(-1)[0].where;
    expect(where.startDatetime[Op.gte]).toEqual(new Date(2026, 9, 13));
    expect(where.startDatetime[Op.lt]).toEqual(new Date(2026, 9, 20));
    await request(app).get(base);
    expect(Booking.findAndCountAll.mock.calls.at(-1)[0].where).toEqual({});
  });
  it('rechaza fechas o estados invalidos en el listado', async () => {
    Booking.findAndCountAll.mockClear();
    for (const q of ['date=2026-02-30', 'dateFrom=hoy', 'dateBefore=2026-13-01', 'status=otro']) {
      const result = await request(app).get(`${base}?${q}`);
      expect(result.status).toBe(422);
    }
    expect(Booking.findAndCountAll).not.toHaveBeenCalled();
  });
  it('devuelve lista vacia sin error', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const result = await request(app).get(base);
    expect(result.body).toMatchObject({ data: [], meta: { total: 0 } });
  });
  it('carga por ID con la entrada y la salida, sin planes, y restringe el tipo de recurso', async () => {
    const result = await request(app).get(`${base}/8`);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ bookingId: 8, date, checkInTime: '15:00', checkOutTime: '20:00' });
    expect(result.body.data).not.toHaveProperty('availablePlans');
    expect(Booking.findOne.mock.calls[0][0]).toMatchObject({ where: { bookingId: '8' }, include: expect.arrayContaining([expect.objectContaining({ where: { resourceType: 'event_hall' } })]) });
  });
  it('detalle inexistente devuelve 404', async () => {
    Booking.findOne.mockResolvedValue(null);
    expect((await request(app).get(`${base}/99`)).status).toBe(404);
  });
  it.each(['page=0', 'pageSize=101', 'page=x'])('rechaza paginacion %s', async (q) => {
    expect((await request(app).get(`${base}?${q}`)).status).toBe(422);
  });
});

describe('HU-014 cambiar el dia de la reserva', () => {
  it('mueve la reserva al nuevo dia con la misma entrada y salida, conservando cliente, recurso, estado y origen', async () => {
    const result = await request(app).patch(`${base}/8`).send({ date: otherDate });
    expect(result.status).toBe(200);
    const next = hallDayWindow(otherDate);
    expect(booking).toMatchObject({ resourceId: 2, customerId: 4, status: 'active', originChannel: 'web', startDatetime: next.start, endDatetime: next.end });
    expect(booking.save).toHaveBeenCalledWith({ fields: ['startDatetime', 'endDatetime'], transaction: expect.any(Object) });
    expect(result.body.data).toMatchObject({ bookingId: 8, date: otherDate, checkInTime: '15:00', checkOutTime: '20:00' });
    expect(Customer.create).not.toHaveBeenCalled();
  });
  it('excluye la propia reserva y revisa el dia completo del nuevo dia', async () => {
    expect((await request(app).patch(`${base}/8`).send({ date })).status).toBe(200);
    const query = Booking.findOne.mock.calls.find(([options]) => !options.include)[0];
    expect(query.where.bookingId[Op.ne]).toBe(8);
    expect(query.where.startDatetime[Op.lt]).toEqual(hallDayWindow(date).dayEnd);
    expect(query.where.endDatetime[Op.gt]).toEqual(hallDayWindow(date).dayStart);
    expect(query.where.status[Op.in]).toEqual(['pending', 'active', 'checked_in']);
  });
  it.each(['booking', 'block'])('rechaza conflicto %s sin guardar', async (type) => {
    if (type === 'booking') Booking.findOne.mockResolvedValue({ bookingId: 99 });
    else ResourceBlock.findOne.mockResolvedValue({ blockId: 2 });
    expect((await request(app).patch(`${base}/8`).send({ date: otherDate })).status).toBe(409);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it('rechaza reserva cancelada', async () => {
    booking.status = 'cancelled';
    expect((await request(app).patch(`${base}/8`).send({ date: otherDate })).status).toBe(409);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it.each(['missing', 'otherResource'])('rechaza reserva %s con 404', async (type) => {
    if (type === 'missing') Booking.findByPk.mockResolvedValue(null);
    else Resource.findOne.mockResolvedValue(null);
    expect((await request(app).patch(`${base}/8`).send({ date: otherDate })).status).toBe(404);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it.each([
    {}, { customerId: 5 }, { resourceId: 3 }, { status: 'active' }, { originChannel: 'staff' },
    { planId: 1 }, { extraHours: 2 }, { startDatetime: '2030-01-01T10:00:00Z' }, { endDatetime: '2030-01-01T11:00:00Z' },
    { date: null }, { date: 'invalid' }, { date: '2026-02-30' }, { date: 20261120 }, { date: otherDate, planId: 2 },
  ])('rechaza body invalido %j', async (body) => {
    expect((await request(app).patch(`${base}/8`).send(body)).status).toBe(422);
    expect(booking.save).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', 'abc'])('valida ID %s en lectura y escritura', async (id) => {
    expect((await request(app).get(`${base}/${id}`)).status).toBe(422);
    expect((await request(app).patch(`${base}/${id}`).send({ date: otherDate })).status).toBe(422);
  });
  it.each([
    ['pasado', () => isoDay(-1)],
    ['mas de 30 dias', () => isoDay(31)],
  ])('rechaza un dia %s', async (_name, make) => {
    expect((await request(app).patch(`${base}/8`).send({ date: make() })).status).toBe(422);
    expect(booking.save).not.toHaveBeenCalled();
  });
});

describe('HU-015 cancelar reservas del salon', () => {
  it('cancela sin motivo y conserva todos los datos de la reserva', async () => {
    const result = await request(app).post(`${base}/8/cancel`);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ bookingId: 8, status: 'cancelled' });
    expect(booking).toMatchObject({ customerId: 4, resourceId: 2, startDatetime: start, endDatetime: end, originChannel: 'web' });
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
    const available = await request(app).get(`${base}/availability`).query({ resourceId: 2, date });
    expect(available.body.data.available).toBe(true);
    expect((await request(app).patch(`${base}/8`).send({ date: otherDate })).status).toBe(409);
  });
});

describe('regresion HU-007 y HU-013', () => {
  it('mantiene la ruta estatica de disponibilidad', async () => {
    const result = await request(app).get(`${base}/availability`).query({ resourceId: 2, date });
    expect(result.status).toBe(200);
    expect(result.body.data.available).toBe(true);
  });
  it('ya no existe el catalogo de planes del salon', async () => {
    expect((await request(app).get('/api/event-hall-plans')).status).toBe(404);
  });
});
