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
  Booking: { findAndCountAll: jest.fn() },
  Resource: { name: 'Resource' },
  ResourceBlock: { name: 'ResourceBlock' },
  Customer: { name: 'Customer' },
}));

const { Booking } = require('../../src/models');
const service = require('../../src/modules/reservasCancha/reservasCancha.service');
const { listBookingsRules } = require('../../src/modules/reservasCancha/reservasCancha.validator');

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
