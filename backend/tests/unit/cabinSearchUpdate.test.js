'use strict';

// HU-018 (buscar reserva de cabina por huesped) y HU-019 (modificar reserva
// de cabina) -- Sprint 3.
jest.mock('../../src/models', () => ({
  Booking: {
    findAndCountAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn(),
  },
  Resource: { findOne: jest.fn(), findAll: jest.fn() },
  ResourceBlock: { findOne: jest.fn(), findAll: jest.fn() },
  CabinDetail: { findByPk: jest.fn() },
  Customer: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  AuditLog: { create: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  BookingExtensionRequest: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../../src/app');
const {
  Booking, Resource, ResourceBlock, CabinDetail, Customer, AuditLog,
} = require('../../src/models');
const {
  CHECK_IN_TIME, CHECK_OUT_TIME, toHotelDatetime, todayInHotelTimeZone, addDays,
} = require('../../src/modules/reservasCabina/cabinStay.util');
const util = require('../../src/modules/reservasCabina/cabinBookingUpdate.util');
const searchUtil = require('../../src/modules/reservasCabina/cabinSearch.util');

const base = '/api/cabin-bookings';
const today = todayInHotelTimeZone();
const checkIn = addDays(today, 10);
const checkOut = addDays(today, 13); // 3 noches

const cabins = {
  3: { resourceId: 3, name: 'Cabina 1', status: 'available' },
  4: { resourceId: 4, name: 'Cabina 2', status: 'available' },
};
const details = {
  3: { resourceId: 3, capacity: 2, pricePerNight: '35000.00' },
  4: { resourceId: 4, capacity: 4, pricePerNight: '55000.00' },
};

let booking;
let guest;

function makeBooking(overrides = {}) {
  const row = {
    bookingId: 5,
    resourceId: 3,
    customerId: 7,
    partySize: 2,
    status: 'active',
    startDatetime: toHotelDatetime(checkIn, CHECK_IN_TIME),
    endDatetime: toHotelDatetime(checkOut, CHECK_OUT_TIME),
    ...overrides,
  };
  row.update = jest.fn(async (values) => Object.assign(row, values));
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  booking = makeBooking();
  guest = {
    customerId: 7,
    fullName: 'Ana Mora',
    identificationNumber: '1-1111-1111',
    phone: '88881111',
    email: 'ana@example.com',
  };
  guest.update = jest.fn(async (values) => Object.assign(guest, values));

  Booking.findByPk.mockImplementation(async () => booking);
  Booking.findOne.mockResolvedValue(null);
  Booking.findAll.mockResolvedValue([]);
  Resource.findOne.mockImplementation(async ({ where }) => cabins[where.resourceId] || null);
  Resource.findAll.mockResolvedValue([]);
  ResourceBlock.findOne.mockResolvedValue(null);
  ResourceBlock.findAll.mockResolvedValue([]);
  CabinDetail.findByPk.mockImplementation(async (id) => details[id] || null);
  Customer.findByPk.mockImplementation(async () => guest);
  Customer.findOne.mockResolvedValue(null);
  AuditLog.findOne.mockResolvedValue(null);
  AuditLog.findAll.mockResolvedValue([]);
  AuditLog.create.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
describe('HU-018 buscar reserva de cabina por huesped', () => {
  it('conserva el orden original sin operation y pagina el orden operativo en SQL', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 45 });
    await request(app).get(`${base}/search?q=wagner&page=2&pageSize=20`);
    expect(Booking.findAndCountAll.mock.calls.at(-1)[0].order).toEqual([['startDatetime', 'DESC'], ['bookingId', 'DESC']]);
    for (const operation of ['check-in', 'check-out']) {
      const result = await request(app).get(`${base}/search?q=wagner&operation=${operation}&page=2&pageSize=20`);
      expect(result.status).toBe(200);
      const options = Booking.findAndCountAll.mock.calls.at(-1)[0];
      expect(options.offset).toBe(20);
      expect(options.limit).toBe(20);
      expect(options.order.slice(1)).toEqual([['startDatetime', 'ASC'], ['bookingId', 'ASC']]);
      expect(options.order[0][0].val).toContain('CASE WHEN');
    }
  });

  it('rechaza operaciones desconocidas antes de consultar reservas', async () => {
    const result = await request(app).get(`${base}/search?q=wagner&operation=otro`);
    expect(result.status).toBe(422);
    expect(Booking.findAndCountAll).not.toHaveBeenCalled();
  });

  const row = (overrides = {}) => ({
    bookingId: 5,
    status: 'active',
    partySize: 3,
    startDatetime: toHotelDatetime(checkIn, CHECK_IN_TIME),
    endDatetime: toHotelDatetime(checkOut, CHECK_OUT_TIME),
    resource: { resourceId: 4, name: 'Cabina 2', cabinDetail: { capacity: 4, pricePerNight: '55000.00' } },
    customer: {
      customerId: 7, fullName: 'Ana Mora', identificationNumber: '1-1111-1111', phone: '88881111', email: 'ana@example.com',
    },
    ...overrides,
  });

  it('la tarifa total es la ultima registrada de cada reserva (no la tarifa actual)', async () => {
    Booking.findAndCountAll.mockResolvedValue({
      rows: [row(), row({ bookingId: 6 })], count: 2,
    });
    AuditLog.findAll.mockResolvedValue([
      { entityId: 5, details: JSON.stringify({ totalAmount: 210000 }) },
      { entityId: 5, details: JSON.stringify({ totalAmount: 150000 }) },
    ]);
    const result = await request(app).get(`${base}/search?q=ana`);
    expect(result.status).toBe(200);
    const [first, second] = result.body.data;
    expect(first).toMatchObject({ bookingId: 5, totalAmount: 210000, isTotalEstimated: false });
    // Sin registro: noches x tarifa actual y se marca como estimada.
    expect(second).toMatchObject({ bookingId: 6, totalAmount: 165000, isTotalEstimated: true });
    expect(AuditLog.findAll).toHaveBeenCalledTimes(1);
  });

  it('CA-1 busca por nombre o identificacion con coincidencia parcial y devuelve lo necesario', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [row()], count: 1 });
    const result = await request(app).get(`${base}/search?q=  ana  `);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([{
      bookingId: 5,
      status: 'active',
      isModifiable: true,
      cabin: { resourceId: 4, name: 'Cabina 2', capacity: 4 },
      guest: {
        customerId: 7, fullName: 'Ana Mora', identificationNumber: '1-1111-1111', phone: '88881111', email: 'ana@example.com',
      },
      partySize: 3,
      companions: 2,
      stay: { checkInDate: checkIn, checkOutDate: checkOut, nights: 3 },
      totalAmount: 165000,
      isTotalEstimated: true,
    }]);
    expect(result.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1, query: 'ana', message: null });

    const options = Booking.findAndCountAll.mock.calls[0][0];
    const customerInclude = options.include.find((include) => include.as === 'customer');
    expect(customerInclude.required).toBe(true);
    expect(customerInclude.where[Op.or]).toEqual([
      { fullName: { [Op.like]: '%ana%' } },
      { identificationNumber: { [Op.like]: '%ana%' } },
    ]);
    const cabinInclude = options.include.find((include) => include.as === 'resource');
    expect(cabinInclude.where).toEqual({ resourceType: 'cabin' });
    expect(options).toMatchObject({ limit: 20, offset: 0, distinct: true });
  });

  it('escapa los comodines de LIKE para que "%" no devuelva todo', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    await request(app).get(`${base}/search?q=${encodeURIComponent('50%_x')}`);
    const customerInclude = Booking.findAndCountAll.mock.calls[0][0].include.find((i) => i.as === 'customer');
    expect(customerInclude.where[Op.or][0].fullName[Op.like]).toBe('%50\\%\\_x%');
  });

  it('CA-2 sin coincidencias responde 200, lista vacia, el mensaje y el criterio buscado', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const result = await request(app).get(`${base}/search?q=zzz`);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
    expect(result.body.meta).toMatchObject({
      total: 0, query: 'zzz', message: 'No se encontraron reservas con los criterios indicados',
    });
  });

  it('incluye reservas de cualquier estado y marca cuales se pueden modificar', async () => {
    Booking.findAndCountAll.mockResolvedValue({
      rows: [row({ bookingId: 1, status: 'checked_in' }), row({ bookingId: 2, status: 'completed' }), row({ bookingId: 3, status: 'cancelled' })],
      count: 3,
    });
    const result = await request(app).get(`${base}/search?q=ana`);
    expect(result.body.data.map((item) => item.isModifiable)).toEqual([true, false, false]);
    expect(Booking.findAndCountAll.mock.calls[0][0].where).toBeUndefined();
  });

  it('pagina el resultado', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [row()], count: 45 });
    const result = await request(app).get(`${base}/search?q=ana&page=2&pageSize=10`);
    expect(result.body.meta).toMatchObject({ page: 2, pageSize: 10, total: 45, totalPages: 5 });
    expect(Booking.findAndCountAll.mock.calls[0][0]).toMatchObject({ limit: 10, offset: 10 });
  });

  it.each([
    ['sin criterio', ''],
    ['solo espacios', '   '],
  ])('rechaza la busqueda %s con 422', async (_name, q) => {
    const result = await request(app).get(`${base}/search?q=${encodeURIComponent(q)}`);
    expect(result.status).toBe(422);
    expect(result.body.error.message).toBe('Ingrese el nombre o la identificación del huésped para buscar.');
    expect(Booking.findAndCountAll).not.toHaveBeenCalled();
  });

  it('rechaza una busqueda sin el parametro q y paginas invalidas', async () => {
    expect((await request(app).get(`${base}/search`)).status).toBe(422);
    expect((await request(app).get(`${base}/search?q=ana&page=0`)).status).toBe(422);
    expect((await request(app).get(`${base}/search?q=ana&pageSize=500`)).status).toBe(422);
    expect((await request(app).get(`${base}/search?q=${'a'.repeat(101)}`)).status).toBe(422);
  });

  it('la ruta /search no se confunde con :bookingId', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const result = await request(app).get(`${base}/search?q=ana`);
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('HU-019 modificar una reserva de cabina', () => {
  const patch = (body, id = 5) => request(app).patch(`${base}/${id}`).send(body);

  it('CA-1 cambia las fechas, valida la disponibilidad sin chocar con la propia reserva y registra la modificacion', async () => {
    const newOut = addDays(today, 15); // 5 noches
    const result = await patch({ checkOutDate: newOut });

    expect(result.status).toBe(200);
    expect(result.body.data.changed).toBe(true);
    expect(result.body.data.stay).toEqual({ checkInDate: checkIn, checkOutDate: newOut, nights: 5 });
    expect(result.body.data.changes).toEqual({ checkOutDate: { from: checkOut, to: newOut } });

    expect(booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 3, partySize: 2, endDatetime: toHotelDatetime(newOut, CHECK_OUT_TIME) }),
      expect.anything(),
    );
    // La disponibilidad excluye la propia reserva.
    const overlapWhere = Booking.findOne.mock.calls[0][0].where;
    expect(overlapWhere.resourceId).toBe(3);
    expect(overlapWhere.bookingId).toEqual({ [Op.ne]: 5 });

    // Nuevo total = 5 noches x tarifa vigente; queda guardado en la auditoria.
    expect(result.body.data.amounts).toMatchObject({
      repriced: true, nightlyRate: 35000, previousTotal: 105000, totalAmount: 175000,
    });
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const audit = AuditLog.create.mock.calls[0][0];
    expect(audit).toMatchObject({ action: 'cabin_booking_updated', entityType: 'booking', entityId: 5, userId: null });
    expect(JSON.parse(audit.details)).toMatchObject({
      totalAmount: 175000, previousTotal: 105000, nights: 5, repriced: true,
      changes: { checkOutDate: { from: checkOut, to: newOut } },
    });
  });

  it('solo datos del huesped: no revisa la agenda ni toca la reserva y conserva el total registrado', async () => {
    AuditLog.findOne.mockResolvedValue({ details: JSON.stringify({ totalAmount: 200000 }) });
    const result = await patch({ guestPhone: ' 8777 2222 ' });

    expect(result.status).toBe(200);
    expect(guest.update).toHaveBeenCalledWith({ phone: '87772222' }, expect.anything());
    expect(booking.update).not.toHaveBeenCalled();
    expect(Booking.findOne).not.toHaveBeenCalled();
    expect(ResourceBlock.findOne).not.toHaveBeenCalled();
    expect(result.body.data.amounts).toMatchObject({ repriced: false, previousTotal: 200000, totalAmount: 200000 });
    expect(JSON.parse(AuditLog.create.mock.calls[0][0].details).totalAmount).toBe(200000);
  });

  it('corregir datos del huesped funciona aunque la cabina este en mantenimiento', async () => {
    cabins[3] = { ...cabins[3], status: 'maintenance' };
    try {
      const result = await patch({ guestName: 'Ana María Mora' });
      expect(result.status).toBe(200);
    } finally {
      cabins[3] = { resourceId: 3, name: 'Cabina 1', status: 'available' };
    }
  });

  it('cambiar de cabina revalora con la tarifa de la nueva y bloquea ambas cabinas en orden', async () => {
    const result = await patch({ resourceId: 4 });
    expect(result.status).toBe(200);
    expect(result.body.data.cabin).toMatchObject({ resourceId: 4, name: 'Cabina 2' });
    expect(result.body.data.amounts).toMatchObject({ repriced: true, nightlyRate: 55000, totalAmount: 165000 });
    expect(booking.update).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 4 }), expect.anything());
    expect(Resource.findOne.mock.calls.map((call) => call[0].where.resourceId)).toEqual([3, 4]);
    expect(Resource.findOne.mock.calls.every((call) => call[0].lock === 'UPDATE')).toBe(true);
  });

  it('CA-2 cabina u horario ocupado: 409, nada cambia y sugiere cabinas y fechas alternativas', async () => {
    Booking.findOne.mockResolvedValue({ bookingId: 99 });
    Resource.findAll.mockResolvedValue([
      { resourceId: 4, name: 'Cabina 2', cabinDetail: { capacity: 4, pricePerNight: '55000.00' } },
    ]);
    const result = await patch({ checkOutDate: addDays(today, 16) });

    expect(result.status).toBe(409);
    expect(result.body.error).toMatchObject({
      message: 'La cabina no se encuentra disponible en las fechas seleccionadas',
      code: 'CABIN_NOT_AVAILABLE',
    });
    expect(result.body.error.details.alternatives).toEqual([
      { resourceId: 4, name: 'Cabina 2', capacity: 4, pricePerNight: 55000 },
    ]);
    // Mover solo la salida no sugiere fechas de entrada distintas.
    expect(result.body.error.details.alternativeDates).toEqual([]);
    expect(booking.update).not.toHaveBeenCalled();
    expect(guest.update).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('CA-2 al mover la entrada sugiere fechas libres con las mismas noches', async () => {
    Booking.findOne.mockResolvedValue({ bookingId: 99 });
    const newIn = addDays(today, 20);
    const newOut = addDays(today, 23);
    const result = await patch({ checkInDate: newIn, checkOutDate: newOut });
    expect(result.status).toBe(409);
    const dates = result.body.error.details.alternativeDates;
    expect(dates).toHaveLength(3);
    dates.forEach((date) => expect(date.nights).toBe(3));
    expect(dates[0].checkInDate).toBe(addDays(newIn, 1));
  });

  it('CA-2 las fechas alternativas descartan las que chocan con otra reserva', async () => {
    Booking.findOne.mockResolvedValue({ bookingId: 99 });
    const newIn = addDays(today, 20);
    // Otra reserva ocupa del dia +21 al +24: las fechas cercanas no sirven.
    Booking.findAll.mockResolvedValue([{
      startDatetime: toHotelDatetime(addDays(today, 21), CHECK_IN_TIME),
      endDatetime: toHotelDatetime(addDays(today, 24), CHECK_OUT_TIME),
    }]);
    const result = await patch({ checkInDate: newIn, checkOutDate: addDays(today, 23) });
    const starts = result.body.error.details.alternativeDates.map((date) => date.checkInDate);
    // +19 (sale el +22 a las 11:00 y choca con la que entra el +21), asi que
    // las libres mas cercanas son las que terminan antes de +21 o empiezan
    // despues de +24.
    starts.forEach((start) => {
      const startMs = toHotelDatetime(start, CHECK_IN_TIME).getTime();
      const endMs = toHotelDatetime(addDays(start, 3), CHECK_OUT_TIME).getTime();
      const busyStart = toHotelDatetime(addDays(today, 21), CHECK_IN_TIME).getTime();
      const busyEnd = toHotelDatetime(addDays(today, 24), CHECK_OUT_TIME).getTime();
      expect(startMs < busyEnd && endMs > busyStart).toBe(false);
    });
  });

  it('CA-2 cambiar a una cabina en mantenimiento se rechaza como no disponible', async () => {
    cabins[4] = { ...cabins[4], status: 'maintenance' };
    try {
      const result = await patch({ resourceId: 4 });
      expect(result.status).toBe(409);
      expect(result.body.error.code).toBe('CABIN_NOT_AVAILABLE');
    } finally {
      cabins[4] = { resourceId: 4, name: 'Cabina 2', status: 'available' };
    }
  });

  it('CA-2 un bloqueo de la cabina tambien cuenta como ocupada', async () => {
    ResourceBlock.findOne.mockResolvedValue({ blockId: 1 });
    const result = await patch({ checkOutDate: addDays(today, 14) });
    expect(result.status).toBe(409);
  });

  describe('CA-3 reserva con check-in realizado', () => {
    beforeEach(() => { booking = makeBooking({ status: 'checked_in' }); });

    it('no permite reasignar la cabina', async () => {
      const result = await patch({ resourceId: 4 });
      expect(result.status).toBe(422);
      expect(result.body.error).toMatchObject({
        message: 'No es posible reasignar cabina con huésped hospedado',
        code: 'CABIN_CHANGE_BLOCKED',
      });
      expect(booking.update).not.toHaveBeenCalled();
      expect(AuditLog.create).not.toHaveBeenCalled();
    });

    it('no permite mover la fecha de entrada', async () => {
      const result = await patch({ checkInDate: addDays(today, 11) });
      expect(result.status).toBe(422);
      expect(result.body.error.code).toBe('CHECK_IN_DATE_LOCKED');
    });

    it('si permite cambiar la fecha de salida y los datos de contacto', async () => {
      const newOut = addDays(today, 14);
      const result = await patch({ checkOutDate: newOut, guestPhone: '88889999', guestEmail: 'nueva@example.com' });
      expect(result.status).toBe(200);
      expect(booking.update).toHaveBeenCalled();
      expect(guest.update).toHaveBeenCalledWith({ phone: '88889999', email: 'nueva@example.com' }, expect.anything());
    });

    it('reenviar la misma cabina o la misma entrada no cuenta como un cambio', async () => {
      const result = await patch({ resourceId: 3, checkInDate: checkIn, guestPhone: '88889999' });
      expect(result.status).toBe(200);
    });
  });

  it.each(['completed', 'cancelled', 'rejected', 'pending'])('no modifica una reserva en estado %s', async (status) => {
    booking = makeBooking({ status });
    const result = await patch({ guestPhone: '88889999' });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('BOOKING_NOT_MODIFIABLE');
    expect(guest.update).not.toHaveBeenCalled();
  });

  it('404 si la reserva no existe', async () => {
    Booking.findByPk.mockResolvedValue(null);
    const result = await patch({ guestPhone: '88889999' }, 999);
    expect(result.status).toBe(404);
  });

  it('404 si la cabina nueva no existe', async () => {
    const result = await patch({ resourceId: 55 });
    expect(result.status).toBe(404);
    expect(result.body.error.message).toBe('La cabina indicada no existe.');
  });

  it('sin cambios reales responde 200 changed:false y no escribe ni audita', async () => {
    const result = await patch({ guestName: 'Ana    Mora', companions: 1, guestEmail: 'ANA@example.com' });
    expect(result.status).toBe(200);
    expect(result.body.data.changed).toBe(false);
    expect(result.body.data.changes).toEqual({});
    expect(booking.update).not.toHaveBeenCalled();
    expect(guest.update).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('rechaza un grupo que no cabe en la cabina', async () => {
    const result = await patch({ companions: 5 });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('CAPACITY_EXCEEDED');
  });

  it('al cambiar de cabina valida la capacidad de la nueva', async () => {
    booking = makeBooking({ partySize: 4, resourceId: 4 });
    const result = await patch({ resourceId: 3 });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('CAPACITY_EXCEEDED');
  });

  it('rechaza un correo que ya es de otro huesped', async () => {
    Customer.findOne.mockResolvedValue({ customerId: 8 });
    const result = await patch({ guestEmail: 'otro@example.com' });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('EMAIL_IN_USE');
    expect(Customer.findOne.mock.calls[0][0].where.customerId).toEqual({ [Op.ne]: 7 });
    expect(guest.update).not.toHaveBeenCalled();
  });

  it('rechaza fechas invalidas: salida antes de la entrada, entrada o salida pasadas', async () => {
    const sameDay = await patch({ checkOutDate: checkIn });
    expect(sameDay.status).toBe(422);
    expect(sameDay.body.error.code).toBe('INVALID_DATES');
    const pastIn = await patch({ checkInDate: addDays(today, -2), checkOutDate: addDays(today, 12) });
    expect(pastIn.status).toBe(422);
    expect(pastIn.body.error.message).toMatch(/entrada/);
    booking = makeBooking({ startDatetime: toHotelDatetime(addDays(today, -5), CHECK_IN_TIME), endDatetime: toHotelDatetime(addDays(today, 2), CHECK_OUT_TIME) });
    const pastOut = await patch({ checkOutDate: addDays(today, -1) });
    expect(pastOut.status).toBe(422);
    expect(booking.update).not.toHaveBeenCalled();
  });

  it('una reserva cuya entrada ya paso permite cambiar solo la salida a futuro', async () => {
    booking = makeBooking({
      startDatetime: toHotelDatetime(addDays(today, -2), CHECK_IN_TIME),
      endDatetime: toHotelDatetime(addDays(today, 1), CHECK_OUT_TIME),
    });
    const result = await patch({ checkOutDate: addDays(today, 3) });
    expect(result.status).toBe(200);
  });

  describe('validacion de forma', () => {
    it.each([
      ['cuerpo vacio', {}],
      ['campo no editable (identificacion)', { guestIdentification: '9-9999-9999' }],
      ['fecha mal formada', { checkInDate: '12/10/2026' }],
      ['fecha inexistente', { checkOutDate: '2026-02-31' }],
      ['correo invalido', { guestEmail: 'no-es-correo' }],
      ['telefono corto', { guestPhone: '123' }],
      ['nombre corto', { guestName: 'Al' }],
      ['acompanantes negativos', { companions: -1 }],
      ['cabina invalida', { resourceId: 0 }],
    ])('422 con %s', async (_name, body) => {
      const result = await patch(body);
      expect(result.status).toBe(422);
      expect(Booking.findByPk).not.toHaveBeenCalled();
    });

    it('422 con id de reserva invalido', async () => {
      expect((await patch({ guestPhone: '88889999' }, 'abc')).status).toBe(422);
    });

    it('la salida no puede ser 0 acompanantes invalida pero 0 si es valido', async () => {
      booking = makeBooking({ partySize: 2 });
      const result = await patch({ companions: 0 });
      expect(result.status).toBe(200);
      expect(booking.update).toHaveBeenCalledWith(expect.objectContaining({ partySize: 1 }), expect.anything());
    });
  });
});

// ---------------------------------------------------------------------------
describe('cabinBookingUpdate.util y cabinSearch.util', () => {
  const current = {
    resourceId: 3, checkInDate: '2026-11-01', checkOutDate: '2026-11-04', companions: 1,
    guestName: 'Ana Mora', guestPhone: '88881111', guestEmail: 'ana@example.com',
  };

  it('diffBookingChanges solo reporta lo que realmente cambia', () => {
    const { changes, next } = util.diffBookingChanges(current, {
      resourceId: '3', checkOutDate: '2026-11-06', guestName: '  Ana   Mora ', guestEmail: 'ANA@example.com', companions: 1,
    });
    expect(changes).toEqual({ checkOutDate: { from: '2026-11-04', to: '2026-11-06' } });
    expect(next.checkOutDate).toBe('2026-11-06');
    expect(next.guestName).toBe('Ana Mora');
  });

  it('ignora campos no enviados y convierte numeros', () => {
    const { changes } = util.diffBookingChanges(current, { resourceId: '4', companions: '2' });
    expect(changes).toEqual({ resourceId: { from: 3, to: 4 }, companions: { from: 1, to: 2 } });
  });

  it('getCheckedInViolation solo aplica a reservas con ingreso', () => {
    expect(util.getCheckedInViolation('active', { resourceId: { from: 3, to: 4 } })).toBeNull();
    expect(util.getCheckedInViolation('checked_in', { checkOutDate: {} })).toBeNull();
    expect(util.getCheckedInViolation('checked_in', { resourceId: {} }).code).toBe('CABIN_CHANGE_BLOCKED');
    expect(util.getCheckedInViolation('checked_in', { checkInDate: {} }).code).toBe('CHECK_IN_DATE_LOCKED');
  });

  it('touches detecta campos de agenda y de huesped', () => {
    expect(util.touches({ guestPhone: {} }, util.SCHEDULE_FIELDS)).toBe(false);
    expect(util.touches({ checkInDate: {} }, util.SCHEDULE_FIELDS)).toBe(true);
    expect(util.touches({ guestEmail: {} }, util.GUEST_FIELDS)).toBe(true);
  });

  it('normalizeSearchTerm y escapeLike', () => {
    expect(searchUtil.normalizeSearchTerm('  Ana   Mora ')).toBe('Ana Mora');
    expect(searchUtil.normalizeSearchTerm(undefined)).toBe('');
    expect(searchUtil.normalizeSearchTerm(['a'])).toBe('');
    expect(searchUtil.escapeLike('a%b_c\\')).toBe('a\\%b\\_c\\\\');
  });
});


describe('HU-017 listado general de reservas', () => {
  const row = (status, bookingId) => ({
    bookingId, status, partySize: 2,
    startDatetime: toHotelDatetime(checkIn, CHECK_IN_TIME),
    endDatetime: toHotelDatetime(checkOut, CHECK_OUT_TIME),
    resource: { resourceId: 3, name: 'Cabina 1', cabinDetail: details[3] },
    customer: { customerId: 7, fullName: 'Ana Mora', phone: '88881111' },
  });

  it('lista todos los estados con huésped, fechas y montos históricos', async () => {
    const statuses = ['pending', 'active', 'rejected', 'checked_in', 'completed', 'cancelled'];
    Booking.findAndCountAll.mockResolvedValue({ rows: statuses.map(row), count: 6 });
    AuditLog.findAll.mockResolvedValue([{ entityId: 0, details: '{"totalAmount":90000}' }]);
    const response = await request(app).get(base).expect(200);
    expect(response.body.data.map((item) => item.status)).toEqual(statuses);
    expect(response.body.data[0]).toMatchObject({
      bookingId: 0, guest: { fullName: 'Ana Mora' }, cabin: { name: 'Cabina 1' },
      stay: { checkInDate: checkIn, checkOutDate: checkOut }, totalAmount: 90000, isTotalEstimated: false,
    });
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 6, totalPages: 1 });
    const options = Booking.findAndCountAll.mock.calls[0][0];
    // El JOIN obligatorio excluye cancha y salón; no se filtran estados ni huéspedes.
    expect(options.include[0]).toMatchObject({ required: true, where: { resourceType: 'cabin' } });
    expect(options.where).toBeUndefined();
    expect(options.include[1].where).toBeUndefined();
  });

  it('pagina con orden estable y distingue una página vacía del total vacío', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 2 });
    const response = await request(app).get(base).query({ page: 3, pageSize: 1 }).expect(200);
    expect(Booking.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 1, offset: 2, distinct: true, order: [['startDatetime', 'DESC'], ['bookingId', 'DESC']],
    }));
    expect(response.body.meta).toMatchObject({ total: 2, totalPages: 2, message: null });
  });

  it('CA-2 devuelve 200 y lista vacía sin consultar importes', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const response = await request(app).get(base).expect(200);
    expect(response.body).toEqual({ data: [], meta: {
      page: 1, pageSize: 20, total: 0, totalPages: 0, message: 'No hay reservas de cabinas registradas',
    } });
    expect(AuditLog.findAll).not.toHaveBeenCalled();
  });

  it.each(['page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=1000001', 'pageSize=0', 'pageSize=51'])('rechaza %s', async (query) => {
    await request(app).get(`${base}?${query}`).expect(422);
    expect(Booking.findAndCountAll).not.toHaveBeenCalled();
  });

  it('un fallo de consulta es un error 500, no una lista vacía', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      Booking.findAndCountAll.mockRejectedValueOnce(new Error('Consulta fallida'));
      const response = await request(app).get(base).expect(500);
      expect(response.body.error.message).toBe('Consulta fallida');
      expect(response.body.data).toBeUndefined();
    } finally { log.mockRestore(); }
  });
});
