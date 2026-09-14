'use strict';

// Pruebas unitarias del servicio de reservas de cancha sintetica.
// Cubren HU-002 (listado). Primer archivo de pruebas del proyecto: sirve
// tambien de patron para las demas HU.
//
// Se MOCKEA la capa de modelos (../../src/models) para que estas pruebas
// NO toquen MySQL ni necesiten Docker levantado: se verifica la logica
// de negocio (armado del filtro, paginacion, mapeo de la respuesta), no
// la consulta SQL real. Esa parte se cubre en tests/integration/ cuando
// exista el harness de base de datos de prueba.
//
// Ejecutar: (desde backend/)  pnpm test
//                             pnpm test -- reservasCancha

jest.mock('../../src/models', () => ({
  Booking: { findAndCountAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Resource: { name: 'Resource', findOne: jest.fn() },
  ResourceBlock: { name: 'ResourceBlock', findOne: jest.fn() },
  Customer: { name: 'Customer', findOrCreate: jest.fn(), findByPk: jest.fn() },
  AuditLog: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));

const { Booking, Resource, ResourceBlock, Customer } = require('../../src/models');
const { Op } = require('sequelize');
const request = require('supertest');
const app = require('../../src/app');
const service = require('../../src/modules/reservasCancha/reservasCancha.service');
const { listBookingsRules, searchBookingsRules } = require('../../src/modules/reservasCancha/reservasCancha.validator');

afterEach(() => {
  jest.clearAllMocks();
});

// Corre la cadena de reglas de express-validator (mas el middleware
// final handleValidationErrors) contra un req falso, sin levantar
// Express. Devuelve si se llamo next() (query valida) o si se corto con
// un status/json (query invalida).
async function runValidator(rules, query) {
  const req = { query, body: {}, params: {}, cookies: {}, headers: {} };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalled = false;
  for (const rule of rules) {
    if (typeof rule.run === 'function') {
      await rule.run(req); // ValidationChain
    } else {
      rule(req, res, () => { nextCalled = true; }); // handleValidationErrors
    }
  }
  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

// ---------------------------------------------------------------------
// Helper puro: buildListBookingsWhere
// ---------------------------------------------------------------------
describe('reservasCanchaService.buildListBookingsWhere (HU-002)', () => {
  it('sin filtros devuelve un where vacio', () => {
    expect(service.buildListBookingsWhere({})).toEqual({});
    expect(service.buildListBookingsWhere()).toEqual({});
  });

  it('con status valido lo agrega tal cual al where', () => {
    expect(service.buildListBookingsWhere({ status: 'active' })).toEqual({ status: 'active' });
    expect(service.buildListBookingsWhere({ status: 'cancelled' })).toEqual({ status: 'cancelled' });
  });

  it('con status vacio o nulo NO agrega el filtro', () => {
    expect(service.buildListBookingsWhere({ status: '' })).toEqual({});
    expect(service.buildListBookingsWhere({ status: null })).toEqual({});
  });

  it('rechaza un status desconocido con DomainError 422', () => {
    expect(() => service.buildListBookingsWhere({ status: 'inventado' }))
      .toThrow(expect.objectContaining({ name: 'DomainError', statusCode: 422 }));
  });

  it('con date arma el rango [inicio de ese dia, inicio del dia siguiente) en hora local', () => {
    const where = service.buildListBookingsWhere({ date: '2026-09-15' });
    const range = where.startDatetime;
    const bounds = Object.getOwnPropertySymbols(range).map((sym) => range[sym]);
    const gte = bounds[0] <= bounds[1] ? bounds[0] : bounds[1];
    const lt = bounds[0] <= bounds[1] ? bounds[1] : bounds[0];

    expect(gte.getFullYear()).toBe(2026);
    expect(gte.getMonth()).toBe(8); // septiembre (0-index)
    expect(gte.getDate()).toBe(15);
    expect(gte.getHours()).toBe(0);
    expect(lt.getDate()).toBe(16);
    expect(lt - gte).toBe(24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------
// Helper puro: normalizePagination
// ---------------------------------------------------------------------
describe('reservasCanchaService.normalizePagination (HU-002)', () => {
  it('sin parametros usa page 1 y el tamano por defecto', () => {
    expect(service.normalizePagination()).toEqual({
      page: 1,
      pageSize: service.DEFAULT_PAGE_SIZE,
      limit: service.DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it('convierte los valores de texto del query string y calcula el offset', () => {
    expect(service.normalizePagination({ page: '3', pageSize: '5' }))
      .toEqual({ page: 3, pageSize: 5, limit: 5, offset: 10 });
  });

  it('valores invalidos o fuera de rango caen a valores seguros', () => {
    expect(service.normalizePagination({ page: '0', pageSize: '-4' }))
      .toEqual({ page: 1, pageSize: service.DEFAULT_PAGE_SIZE, limit: service.DEFAULT_PAGE_SIZE, offset: 0 });

    expect(service.normalizePagination({ page: 'abc', pageSize: '99999' }))
      .toEqual({ page: 1, pageSize: service.MAX_PAGE_SIZE, limit: service.MAX_PAGE_SIZE, offset: 0 });
  });
});

// ---------------------------------------------------------------------
// listFieldBookings — HU-002
// ---------------------------------------------------------------------
describe('reservasCanchaService.listFieldBookings (HU-002)', () => {
  const fakeRow = {
    get: () => ({
      bookingId: 7,
      status: 'active',
      originChannel: 'staff',
      startDatetime: '2026-09-15T19:00:00.000Z',
      endDatetime: '2026-09-15T21:00:00.000Z',
      resource: { resourceId: 1, name: 'Cancha sintetica' },
      customer: { customerId: 3, fullName: 'Luis Vargas Mora', phone: '88887777' },
    }),
  };

  it('CP-002-01 devuelve el listado mapeado y su metadata de paginacion', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [fakeRow], count: 1 });

    const result = await service.listFieldBookings({});

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      bookingId: 7,
      status: 'active',
      originChannel: 'staff',
      startDatetime: '2026-09-15T19:00:00.000Z',
      endDatetime: '2026-09-15T21:00:00.000Z',
      resource: { resourceId: 1, name: 'Cancha sintetica' },
      customer: { customerId: 3, fullName: 'Luis Vargas Mora', phone: '88887777' },
    });
  });

  it('CP-002-02 sin reservas: items vacio, total 0 y totalPages 0 (no es un error)', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

    const result = await service.listFieldBookings({});

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('solo lista reservas cuyo recurso es una cancha (INNER JOIN resourceType=field)', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

    await service.listFieldBookings({});

    const queryArg = Booking.findAndCountAll.mock.calls[0][0];
    const resourceInclude = queryArg.include.find((inc) => inc.as === 'resource');
    expect(resourceInclude.required).toBe(true);
    expect(resourceInclude.where).toEqual({ resourceType: 'field' });
    expect(queryArg.order).toEqual([['startDatetime', 'ASC']]);
  });

  it('traslada la paginacion a limit/offset de Sequelize', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 42 });

    const result = await service.listFieldBookings({ page: '3', pageSize: '5' });

    const queryArg = Booking.findAndCountAll.mock.calls[0][0];
    expect(queryArg.limit).toBe(5);
    expect(queryArg.offset).toBe(10);
    expect(result.totalPages).toBe(9); // ceil(42 / 5)
  });

  it('propaga el DomainError 422 cuando el status del filtro no es valido', async () => {
    await expect(service.listFieldBookings({ status: 'xyz' }))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 422 });
    expect(Booking.findAndCountAll).not.toHaveBeenCalled();
  });

  it('mapea filas que ya vienen como objeto plano (sin .get de Sequelize)', async () => {
    Booking.findAndCountAll.mockResolvedValue({
      rows: [{
        bookingId: 9,
        status: 'pending',
        originChannel: 'web',
        startDatetime: '2026-10-01T13:00:00.000Z',
        endDatetime: '2026-10-01T15:00:00.000Z',
        resource: { resourceId: 1, name: 'Cancha sintetica' },
        customer: null,
      }],
      count: 1,
    });

    const result = await service.listFieldBookings({});
    expect(result.items[0].customer).toBeNull();
    expect(result.items[0].status).toBe('pending');
  });

  // CP-002-03 "Acceso sin permisos": depende del middleware de
  // autenticacion/roles que todavia no existe en el proyecto (llega en
  // el modulo usuariosSeguridad, Sprint 5). Se cubrira como prueba de
  // integracion sobre la ruta GET /api/field-bookings cuando exista.
  it.todo('CP-002-03 acceso sin permisos responde 401/403 (pendiente middleware auth, Sprint 5)');
});

// ---------------------------------------------------------------------
// listBookingsRules — validador de forma de HU-002
// ---------------------------------------------------------------------
describe('listBookingsRules (HU-002, validacion de forma)', () => {
  it('deja pasar una consulta sin filtros', async () => {
    const r = await runValidator(listBookingsRules, {});
    expect(r.nextCalled).toBe(true);
  });

  it('deja pasar filtros bien formados', async () => {
    const r = await runValidator(listBookingsRules, {
      date: '2026-09-15', status: 'active', page: '2', pageSize: '10',
    });
    expect(r.nextCalled).toBe(true);
  });

  it('CP-002 (forma) rechaza una fecha imposible con 422', async () => {
    const r = await runValidator(listBookingsRules, { date: '2026-13-45' });
    expect(r.nextCalled).toBe(false);
    expect(r.statusCode).toBe(422);
    expect(r.body.error.details.some((d) => d.field === 'date')).toBe(true);
  });

  it('rechaza un status desconocido con 422', async () => {
    const r = await runValidator(listBookingsRules, { status: 'bogus' });
    expect(r.statusCode).toBe(422);
  });

  it('rechaza page < 1 y pageSize > 100 con 422', async () => {
    expect((await runValidator(listBookingsRules, { page: '0' })).statusCode).toBe(422);
    expect((await runValidator(listBookingsRules, { pageSize: '500' })).statusCode).toBe(422);
  });
});

// HU-003: consultas y contrato HTTP con modelos simulados (sin MySQL).
describe('HU-003 buscar reservas', () => {
  const row = {
    bookingId: 31, status: 'cancelled', originChannel: 'staff',
    startDatetime: '2026-09-15T19:00:00.000Z', endDatetime: '2026-09-15T21:00:00.000Z',
    resource: { resourceId: 1, name: 'Cancha sintetica' },
    customer: { customerId: 4, fullName: 'Kendall Mora', phone: '88887777' },
  };
  beforeEach(() => Booking.findAndCountAll.mockResolvedValue({ rows: [row], count: 1 }));

  it.each([
    ['cliente', { customerName: 'Ken' }],
    ['telefono', { phone: '88887777' }],
    ['fecha', { date: '2026-09-15' }],
  ])('CP-003-01 busqueda exitosa por %s', async (_label, criteria) => {
    const result = await service.searchFieldBookings(criteria);
    expect(result.items).toEqual([row]);
    expect(result.total).toBe(1);
    const options = Booking.findAndCountAll.mock.calls[0][0];
    const customer = options.include.find((item) => item.as === 'customer');
    expect(customer.required).toBe(true);
    if (criteria.customerName) expect(customer.where.fullName).toEqual({ [Op.like]: '%Ken%' });
    if (criteria.phone) expect(customer.where.phone).toBe('88887777');
    if (criteria.date) {
      expect(options.where.startDatetime).toEqual({
        [Op.gte]: new Date(2026, 8, 15), [Op.lt]: new Date(2026, 8, 16),
      });
    }
    expect(options.include.find((item) => item.as === 'resource')).toMatchObject({
      required: true, where: { resourceType: 'field' },
    });
    expect(options.where.status).toBeUndefined();
  });

  it('combina nombre, telefono y fecha con AND y pagina los resultados', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [row], count: 42 });
    const result = await service.searchFieldBookings({ customerName: 'Ken', phone: '88887777', date: '2026-09-15', page: '2', pageSize: '5' });
    const options = Booking.findAndCountAll.mock.calls[0][0];
    expect(options.include[1].where).toEqual({ fullName: { [Op.like]: '%Ken%' }, phone: '88887777' });
    expect(options.where.startDatetime).toBeDefined();
    expect(options.limit).toBe(5);
    expect(options.offset).toBe(5);
    expect(options.distinct).toBe(true);
    expect(result.totalPages).toBe(9);
  });

  it('trata los comodines LIKE como texto literal', async () => {
    await service.searchFieldBookings({ customerName: 'Ken%_' });
    expect(Booking.findAndCountAll.mock.calls[0][0].include[1].where.fullName)
      .toEqual({ [Op.like]: '%Ken\\%\\_%' });
  });

  it('CP-003-02 sin resultados devuelve un arreglo vacio y metadata', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const response = await request(app).get('/api/field-bookings/search').query({ customerName: 'Nadie' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  });

  it('ruta de busqueda devuelve cliente y contrato paginado', async () => {
    const response = await request(app).get('/api/field-bookings/search').query({ customerName: 'Ken' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([row]);
    expect(response.body.meta.total).toBe(1);
  });

  it.each([{}, { customerName: '  ', phone: '', date: '' }, { page: '1' }])('rechaza criterios ausentes: %j', async (criteria) => {
    const response = await request(app).get('/api/field-bookings/search').query(criteria);
    expect(response.status).toBe(422);
    expect(response.body.error.details.some((item) => item.message.includes('al menos un criterio'))).toBe(true);
    expect(Booking.findAndCountAll).not.toHaveBeenCalled();
  });

  it('el servicio tambien rechaza una busqueda vacia', async () => {
    await expect(service.searchFieldBookings()).rejects.toMatchObject({ statusCode: 422 });
  });

  it.each([
    { date: '2026-02-30' }, { date: '2026-9-1' },
    { customerName: ['Ken', 'Ana'] }, { phone: { value: '88887777' } },
    { customerName: 'K'.repeat(151) }, { phone: '8'.repeat(21) },
    { customerName: 'Ken', page: '0' }, { customerName: 'Ken', pageSize: '101' },
  ])('valida parametros invalidos: %j', async (criteria) => {
    const result = await runValidator(searchBookingsRules, criteria);
    expect(result.statusCode).toBe(422);
  });

  it('acepta nombre de un caracter, fecha historica y campos vacios opcionales', async () => {
    const result = await runValidator(searchBookingsRules, { customerName: ' K ', phone: '', date: '' });
    expect(result.nextCalled).toBe(true);
    expect((await runValidator(searchBookingsRules, { date: '2020-01-01' })).nextCalled).toBe(true);
  });

  it('delega errores al middleware global', async () => {
    Booking.findAndCountAll.mockRejectedValueOnce(new service.DomainError('Error controlado', 422));
    const response = await request(app).get('/api/field-bookings/search').query({ phone: '88887777' });
    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe('Error controlado');
  });
});

describe('compatibilidad HTTP HU-001 y HU-002', () => {
  it('HU-001 mantiene registro y deteccion de conflictos', async () => {
    Resource.findOne.mockResolvedValue({ resourceId: 1, status: 'available' });
    ResourceBlock.findOne.mockResolvedValue(null);
    Booking.findOne.mockResolvedValue(null);
    Customer.findOrCreate.mockResolvedValue([{ customerId: 4 }, false]);
    Booking.create.mockResolvedValue({ bookingId: 32, status: 'active' });
    const start = new Date(Date.now() + 86400000);
    const payload = { resourceId: 1, customerName: 'Kendall Mora', customerPhone: '88887777', startDatetime: start.toISOString(), endDatetime: new Date(start.getTime() + 7200000).toISOString() };
    const response = await request(app).post('/api/field-bookings').send(payload);
    expect(response.status).toBe(201);
    expect(response.body.data.bookingId).toBe(32);
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 4, resourceId: 1, status: 'active', originChannel: 'staff' }));
    Booking.findOne.mockResolvedValueOnce({ bookingId: 32 });
    expect((await request(app).post('/api/field-bookings').send(payload)).status).toBe(409);
    expect((await request(app).post('/api/field-bookings').send({})).status).toBe(422);
  });

  it('HU-002 sigue permitiendo listar sin criterios de busqueda', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const response = await request(app).get('/api/field-bookings');
    expect(response.status).toBe(200);
    expect(response.body.meta.pageSize).toBe(20);
    expect(response.body.data).toEqual([]);
  });
});

describe('HU-005 modificar fechas de reserva', () => {
  let booking;
  let start;
  let end;
  beforeEach(() => {
    start = new Date(Date.now() + 3 * 86400000);
    end = new Date(start.getTime() + 7200000);
    booking = { bookingId: 15, resourceId: 1, customerId: 4, status: 'active', originChannel: 'staff',
      startDatetime: start, endDatetime: end, save: jest.fn().mockResolvedValue(),
      get() { return { bookingId: this.bookingId, resourceId: this.resourceId, customerId: this.customerId,
        status: this.status, originChannel: this.originChannel, startDatetime: this.startDatetime, endDatetime: this.endDatetime }; },
    };
    Booking.findByPk.mockResolvedValue(booking);
    Booking.findOne.mockResolvedValue(null);
    Resource.findOne.mockResolvedValue({ resourceId: 1, name: 'Cancha', status: 'available' });
    ResourceBlock.findOne.mockResolvedValue(null);
    Customer.findByPk.mockResolvedValue({ customerId: 4, fullName: 'Cliente original', phone: '88887777' });
  });

  it('CA-1 PATCH modifica solo fechas y devuelve cliente y recurso originales', async () => {
    const newStart = new Date(start.getTime() + 3600000).toISOString();
    const response = await request(app).patch('/api/field-bookings/15').send({ startDatetime: newStart });
    expect(response.status).toBe(200);
    expect(response.body.data.startDatetime).toBe(newStart);
    expect(response.body.data.endDatetime).toBe(end.toISOString());
    expect(response.body.data.customer.customerId).toBe(4);
    expect(response.body.data.resource.resourceId).toBe(1);
    expect(booking.save).toHaveBeenCalledWith(expect.objectContaining({ fields: ['startDatetime', 'endDatetime'], transaction: expect.any(Object) }));
    expect(Customer.findOrCreate).not.toHaveBeenCalled();
    const options = Booking.findOne.mock.calls[0][0];
    expect(options.where.bookingId).toEqual({ [Op.ne]: 15 });
    expect(options.where.resourceId).toBe(1);
    expect(options.where.startDatetime).toEqual({ [Op.lt]: end });
    expect(options.where.endDatetime).toEqual({ [Op.gt]: new Date(newStart) });
  });

  it('permite conservar el mismo intervalo sin conflicto consigo misma', async () => {
    await expect(service.updateFieldBooking(15, { startDatetime: start.toISOString(), endDatetime: end.toISOString() })).resolves.toMatchObject({ bookingId: 15 });
    expect(Booking.findOne.mock.calls[1][0].where).toMatchObject({ customerId: 4, bookingId: { [Op.ne]: 15 } });
  });

  it.each(['recurso', 'cliente', 'bloqueo'])('CA-2 rechaza conflicto de %s sin guardar', async (kind) => {
    if (kind === 'recurso') Booking.findOne.mockResolvedValueOnce({ bookingId: 20 });
    if (kind === 'cliente') Booking.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ bookingId: 20 });
    if (kind === 'bloqueo') ResourceBlock.findOne.mockResolvedValueOnce({ blockId: 2 });
    const response = await request(app).patch('/api/field-bookings/15').send({ endDatetime: end.toISOString() });
    expect(response.status).toBe(409);
    expect(booking.save).not.toHaveBeenCalled();
  });

  it('CA-3 rechaza reserva cancelada', async () => {
    booking.status = 'cancelled';
    const response = await request(app).patch('/api/field-bookings/15').send({ endDatetime: end.toISOString() });
    expect(response.status).toBe(409);
    expect(booking.save).not.toHaveBeenCalled();
  });

  it('CA-4 sin regla adicional definida: conserva origen web y estado', async () => {
    booking.originChannel = 'web';
    const result = await service.updateFieldBooking(15, { endDatetime: end.toISOString() });
    expect(result).toMatchObject({ originChannel: 'web', status: 'active' });
  });

  it('reserva inexistente devuelve 404', async () => {
    Booking.findByPk.mockResolvedValueOnce(null);
    expect((await request(app).patch('/api/field-bookings/999').send({ endDatetime: end.toISOString() })).status).toBe(404);
    expect(booking.save).not.toHaveBeenCalled();
  });

  it('no permite editar reservas de otros tipos de recurso', async () => {
    Resource.findOne.mockResolvedValueOnce(null);
    await expect(service.updateFieldBooking(15, { endDatetime: end.toISOString() })).rejects.toMatchObject({ statusCode: 404 });
    expect(Resource.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { resourceId: 1, resourceType: 'field' } }));
    expect(booking.save).not.toHaveBeenCalled();
  });

  it.each([
    {}, { customerId: 7 }, { customerName: 'Otro' }, { resourceId: 2 }, { status: 'active' },
    { originChannel: 'staff' }, { startDatetime: null }, { endDatetime: '' },
    { startDatetime: '2026-02-30T13:00:00Z' }, { startDatetime: '2026-09-15' },
    { startDatetime: ['2026-09-15T13:00:00Z'] },
  ])('rechaza campos no permitidos o invalidos: %j', async (body) => {
    expect((await request(app).patch('/api/field-bookings/15').send(body)).status).toBe(422);
    expect(Booking.findByPk).not.toHaveBeenCalled();
    expect(booking.save).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc'])('valida bookingId %s', async (id) => {
    expect((await request(app).patch('/api/field-bookings/' + id).send({ endDatetime: end.toISOString() })).status).toBe(422);
  });

  it('rechaza fin anterior al inicio y fecha pasada sin guardar', async () => {
    await expect(service.updateFieldBooking(15, { endDatetime: new Date(start.getTime() - 1).toISOString() })).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.updateFieldBooking(15, { startDatetime: '2020-01-01T13:00:00Z' })).rejects.toMatchObject({ statusCode: 422 });
    expect(booking.save).not.toHaveBeenCalled();
  });

  it('mantiene la ruta HU-004', async () => {
    Booking.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    expect((await request(app).get('/api/field-bookings/filter?status=active')).status).toBe(200);
    expect((await request(app).get('/api/field-bookings/filter')).status).toBe(422);
  });

  it('mantiene cancelacion HU-006 dentro de politica', async () => {
    const response = await request(app).post('/api/field-bookings/15/cancel').send({ reason: 'Cambio solicitado' });
    expect(response.status).toBe(200);
    expect(booking.status).toBe('cancelled');
    expect(booking.cancellationReason).toBe('Cambio solicitado');
  });
});
