import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-016 (Marvin, Sprint 3) — Registrar una reserva de
// cabina con los datos del huesped.
//
// Unidad bajo prueba: createCabinBooking() en reservasCabina.service.js.
// Criterios de aceptacion de la historia y su capa de prueba:
//   CA-1 Registro exitoso               -> se prueba aqui (service)
//   CA-2 Conflicto de disponibilidad    -> se prueba aqui (service)
//   CA-3 Datos del huesped duplicados   -> se prueba aqui (service)
//
// -----------------------------------------------------------------------
// MISMA TECNICA QUE LAS PRUEBAS DE HU-001, HU-007 Y HU-013
// -----------------------------------------------------------------------
// reservasCabina.service.js (codigo de PRODUCCION, no se toca) usa
// require('../../models'), CommonJS. Vitest no intercepta require(), asi
// que vi.mock() normal no funciona aqui. Se pre-puebla require.cache con
// el mock ANTES de requerir el service, para que su propio
// require('../../models') interno (y el de cabinBilling.service.js, que
// guarda la "foto" del monto en AuditLog) resuelva contra el objeto
// mockeado. Asi la suite no necesita MySQL ni Docker.
//
// Ejecutar: (desde backend/)  npx vitest run tests/unit/reservasCabina.createCabinBooking.vitest.test.js --reporter=verbose

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  Booking: { findOne: vi.fn(), findAll: vi.fn(), create: vi.fn() },
  Resource: { findOne: vi.fn(), findAll: vi.fn() },
  ResourceBlock: { findOne: vi.fn(), findAll: vi.fn() },
  CabinDetail: { findByPk: vi.fn() },
  Customer: { findOne: vi.fn(), create: vi.fn() },
  AuditLog: { create: vi.fn(), findOne: vi.fn(), findAll: vi.fn() },
  sequelize: { transaction: vi.fn() },
};

const modelsAbsolutePath = nodeRequire.resolve('../../src/models');
nodeRequire.cache[modelsAbsolutePath] = {
  id: modelsAbsolutePath,
  filename: modelsAbsolutePath,
  loaded: true,
  exports: mockModels,
};

// Se requiere DESPUES de pre-poblar el cache, para que el service
// resuelva su propio require('../../models') contra el mock.
const service = nodeRequire('../../src/modules/reservasCabina/reservasCabina.service');
// Utilidades puras de fechas (no tocan la base): se usan para armar
// fechas siempre futuras y para calcular el datetime esperado.
const {
  addDays, todayInHotelTimeZone, toHotelDatetime,
} = nodeRequire('../../src/modules/reservasCabina/cabinStay.util');
const { Op } = nodeRequire('sequelize');

const {
  Booking, Resource, ResourceBlock, CabinDetail, Customer, AuditLog, sequelize,
} = mockModels;

// Transaccion falsa: ejecuta el callback con un objeto que trae LOCK,
// igual que la de Sequelize.
const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };

// -----------------------------------------------------------------------
// Datos base validos, reutilizados y "sobreescritos" caso a caso.
// -----------------------------------------------------------------------

// Entrada manana y salida en 2 noches, contadas desde la fecha de Costa
// Rica: siempre en el futuro, sin importar el dia en que corra la suite.
const CHECK_IN_DATE = addDays(todayInHotelTimeZone(), 1);
const CHECK_OUT_DATE = addDays(CHECK_IN_DATE, 2);

function buildValidPayload(overrides = {}) {
  return {
    resourceId: 3,
    guestName: 'Laura Jimenez Mora',
    guestIdentification: '604950088',
    guestPhone: '88887777',
    guestEmail: 'laura.jimenez@correo.com',
    checkInDate: CHECK_IN_DATE,
    checkOutDate: CHECK_OUT_DATE,
    companions: 1, // titular + 1 acompanante = 2 personas
    linkExistingGuest: false,
    ...overrides,
  };
}

// Igual que la cabina 3 del seeder (capacidad 2, 35 000 por noche).
// Sequelize devuelve las columnas DECIMAL como string.
const fakeCabin = { resourceId: 3, name: 'Cabina Almendro', resourceType: 'cabin', status: 'available' };
const fakeCabinDetail = { resourceId: 3, capacity: 2, pricePerNight: '35000.00' };

// Huesped ya registrado con la misma cedula (para CA-3).
const existingGuest = {
  customerId: 15,
  fullName: 'Laura Jimenez Mora',
  identificationNumber: '604950088',
  phone: '88887777',
  email: 'laura.jimenez@correo.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  sequelize.transaction.mockImplementation(async (callback) => callback(fakeTransaction));
  // Estado "feliz" por defecto: cada caso solo sobreescribe el mock que
  // necesita para forzar su escenario.
  Resource.findOne.mockResolvedValue(fakeCabin);
  CabinDetail.findByPk.mockResolvedValue(fakeCabinDetail);
  Booking.findOne.mockResolvedValue(null); // sin reservas cruzadas
  ResourceBlock.findOne.mockResolvedValue(null); // sin bloqueos
  Customer.findOne.mockResolvedValue(null); // cedula y correo nuevos
  Customer.create.mockImplementation(async (data) => ({ customerId: 21, ...data }));
  // Booking.create devuelve lo que recibe mas un id, como haria la BD.
  Booking.create.mockImplementation(async (data) => ({ bookingId: 60, ...data }));
  AuditLog.create.mockResolvedValue({ auditId: 1 });
  // Alternativas (CA-2): por defecto no hay otras cabinas.
  Resource.findAll.mockResolvedValue([]);
  Booking.findAll.mockResolvedValue([]);
  ResourceBlock.findAll.mockResolvedValue([]);
});

describe('reservasCabinaService.createCabinBooking (HU-016)', () => {
  // ---------------------------------------------------------------------
  // CA-1 Registro exitoso
  // ---------------------------------------------------------------------
  it('CP-016-01 CA-1 registro exitoso: asigna la cabina y guarda los datos del huesped', async () => {
    const result = await service.createCabinBooking(buildValidPayload());

    // La cabina se lee con bloqueo de fila dentro de la transaccion.
    expect(Resource.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { resourceId: 3, resourceType: 'cabin' },
      lock: 'UPDATE',
    }));
    // El huesped nuevo se crea con todos sus datos.
    expect(Customer.create).toHaveBeenCalledWith({
      fullName: 'Laura Jimenez Mora',
      identificationNumber: '604950088',
      phone: '88887777',
      email: 'laura.jimenez@correo.com',
    }, { transaction: fakeTransaction });
    // La reserva queda activa, por canal "staff", con check-in 15:00 y
    // check-out 11:00 (hora de Costa Rica) y el grupo completo.
    expect(Booking.create).toHaveBeenCalledTimes(1);
    expect(Booking.create).toHaveBeenCalledWith({
      resourceId: 3,
      customerId: 21,
      originChannel: 'staff',
      startDatetime: toHotelDatetime(CHECK_IN_DATE, '15:00:00'),
      endDatetime: toHotelDatetime(CHECK_OUT_DATE, '11:00:00'),
      partySize: 2,
      status: 'active',
    }, { transaction: fakeTransaction });
    // Se guarda la "foto" del monto: 2 noches x 35 000 = 70 000.
    const [auditEntry] = AuditLog.create.mock.calls[0];
    expect(auditEntry).toMatchObject({ action: 'cabin_booking_created', entityType: 'booking', entityId: 60 });
    expect(JSON.parse(auditEntry.details)).toEqual({ nights: 2, nightlyRate: 35000, totalAmount: 70000 });

    expect(result.booking).toMatchObject({ bookingId: 60, status: 'active' });
    expect(result.cabin).toEqual({
      resourceId: 3, name: 'Cabina Almendro', capacity: 2, pricePerNight: 35000,
    });
    expect(result.guest).toMatchObject({ customerId: 21, identificationNumber: '604950088' });
    expect(result.stay).toEqual({ checkInDate: CHECK_IN_DATE, checkOutDate: CHECK_OUT_DATE, nights: 2 });
    expect(result.totalAmount).toBe(70000);
  });

  // Validaciones previas al registro. No tienen CA propio en la historia;
  // se documentan como casos complementarios de CA-1 (igual que HU-013).
  it('CP-016-01b CA-1 (complementario) cabina inexistente: DomainError 404', async () => {
    Resource.findOne.mockResolvedValueOnce(null);

    await expect(service.createCabinBooking(buildValidPayload({ resourceId: 99 })))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 404, message: 'La cabina indicada no existe.' });
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('CP-016-01c CA-1 (complementario) el grupo supera la capacidad: DomainError 422', async () => {
    // Titular + 2 acompanantes = 3 personas en una cabina para 2.
    await expect(service.createCabinBooking(buildValidPayload({ companions: 2 })))
      .rejects.toMatchObject({
        name: 'DomainError',
        statusCode: 422,
        message: 'La cabina Cabina Almendro tiene capacidad para 2 personas y el grupo es de 3.',
      });
    expect(Customer.create).not.toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('CP-016-01d CA-1 (complementario) fecha de entrada anterior a hoy: DomainError 422', async () => {
    const yesterday = addDays(todayInHotelTimeZone(), -1);

    await expect(service.createCabinBooking(buildValidPayload({ checkInDate: yesterday })))
      .rejects.toMatchObject({
        name: 'DomainError',
        statusCode: 422,
        message: 'No se pueden registrar reservas con fecha de entrada anterior a hoy.',
      });
    // Regla sin base de datos: se rechaza ANTES de abrir la transaccion.
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('CP-016-01e CA-1 (complementario) salida igual a la entrada: DomainError 422', async () => {
    await expect(service.createCabinBooking(buildValidPayload({ checkOutDate: CHECK_IN_DATE })))
      .rejects.toMatchObject({
        name: 'DomainError',
        statusCode: 422,
        message: 'La fecha de salida debe ser posterior a la fecha de entrada.',
      });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // CA-2 Conflicto de disponibilidad
  // ---------------------------------------------------------------------
  it('CP-016-02 CA-2 cabina ocupada: mensaje oficial y sugiere cabinas alternativas libres', async () => {
    Booking.findOne.mockResolvedValueOnce({ bookingId: 44, status: 'active' });
    // Candidatas: la 4 esta libre y la 5 tiene una reserva en esas fechas.
    Resource.findAll.mockResolvedValueOnce([
      { resourceId: 4, name: 'Cabina Guarumo', cabinDetail: { capacity: 4, pricePerNight: '55000.00' } },
      { resourceId: 5, name: 'Cabina Cedro', cabinDetail: { capacity: 6, pricePerNight: '80000.00' } },
    ]);
    Booking.findAll.mockResolvedValueOnce([{ resourceId: 5 }]);

    const error = await service.createCabinBooking(buildValidPayload()).catch((e) => e);

    expect(error).toMatchObject({
      name: 'DomainError',
      statusCode: 409,
      code: 'CABIN_NOT_AVAILABLE',
      message: 'La cabina no se encuentra disponible en las fechas seleccionadas',
    });
    // Solo se sugiere la cabina libre (la 5 queda fuera por estar ocupada).
    expect(error.details.alternatives).toEqual([
      { resourceId: 4, name: 'Cabina Guarumo', capacity: 4, pricePerNight: 55000 },
    ]);
    // Las candidatas excluyen la cabina pedida, estan en servicio y les
    // cabe el grupo (capacidad >= 2).
    const candidatesQuery = Resource.findAll.mock.calls[0][0];
    expect(candidatesQuery.where).toMatchObject({ resourceType: 'cabin', status: 'available' });
    expect(candidatesQuery.where.resourceId[Op.ne]).toBe(3);
    expect(candidatesQuery.include[0].where.capacity[Op.gte]).toBe(2);
    // No se registra nada.
    expect(Customer.create).not.toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('CP-016-02b CA-2 cabina bloqueada en esas fechas: DomainError 409', async () => {
    ResourceBlock.findOne.mockResolvedValueOnce({ blockId: 8, reason: 'Fumigacion' });

    await expect(service.createCabinBooking(buildValidPayload()))
      .rejects.toMatchObject({
        statusCode: 409,
        code: 'CABIN_NOT_AVAILABLE',
        message: 'La cabina no se encuentra disponible en las fechas seleccionadas',
      });
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('CP-016-02c CA-2 cabina fuera de servicio: DomainError 409', async () => {
    Resource.findOne.mockResolvedValueOnce({ ...fakeCabin, status: 'maintenance' });

    await expect(service.createCabinBooking(buildValidPayload()))
      .rejects.toMatchObject({
        statusCode: 409,
        code: 'CABIN_NOT_AVAILABLE',
        message: 'La cabina no se encuentra disponible en las fechas seleccionadas',
      });
    expect(Booking.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // CA-3 Datos del huesped duplicados
  // ---------------------------------------------------------------------
  it('CP-016-03 CA-3 huesped ya registrado: avisa y devuelve el huesped existente', async () => {
    Customer.findOne.mockResolvedValueOnce(existingGuest);

    const error = await service.createCabinBooking(buildValidPayload()).catch((e) => e);

    expect(error).toMatchObject({
      name: 'DomainError',
      statusCode: 409,
      code: 'GUEST_ALREADY_EXISTS',
      message: 'El huésped ya se encuentra registrado',
    });
    expect(error.details.existingGuest).toEqual({
      customerId: 15,
      fullName: 'Laura Jimenez Mora',
      phone: '88887777',
      email: 'laura.jimenez@correo.com',
    });
    // No se crea un segundo perfil ni la reserva.
    expect(Customer.create).not.toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('CP-016-03b CA-3 vincular la reserva al huesped existente', async () => {
    Customer.findOne.mockResolvedValueOnce(existingGuest);

    const result = await service.createCabinBooking(buildValidPayload({ linkExistingGuest: true }));

    expect(Customer.create).not.toHaveBeenCalled();
    expect(Booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 15 }),
      { transaction: fakeTransaction },
    );
    expect(result.guest.customerId).toBe(15);
  });

  it('CP-016-03c CA-3 la duplicidad se valida por identificacion, tambien si se guardo con guiones', async () => {
    await service.createCabinBooking(buildValidPayload());

    // Primera consulta de clientes = busqueda por cedula, en sus dos formas.
    const identificationLookup = Customer.findOne.mock.calls[0][0].where;
    expect(identificationLookup.identificationNumber[Op.in]).toEqual(['604950088', '6-0495-0088']);
  });

  it('CP-016-03d CA-3 (complementario) correo registrado con otra cedula: DomainError 409', async () => {
    Customer.findOne
      .mockResolvedValueOnce(null) // la cedula es nueva
      .mockResolvedValueOnce({ customerId: 30, email: 'laura.jimenez@correo.com' }); // el correo no

    await expect(service.createCabinBooking(buildValidPayload()))
      .rejects.toMatchObject({
        statusCode: 409,
        code: 'EMAIL_IN_USE',
        message: 'Ese correo ya está registrado con otra cédula. Cada cédula usa su propio correo.',
      });
    expect(Customer.create).not.toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
  });
});
