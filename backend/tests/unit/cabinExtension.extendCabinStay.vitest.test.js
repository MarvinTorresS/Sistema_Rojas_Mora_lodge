import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-127 (Marvin, Sprint 3) — Gestionar la solicitud de
// extension de hospedaje de un huesped.
//
// Unidades bajo prueba (cabinExtension.service.js):
//   - extendCabinStay()      -> confirma la extension (escribe).
//   - quoteCabinExtension()  -> cotiza la extension (solo lectura).
// Las dos comparten la MISMA funcion de reglas (evaluateExtension), asi
// que lo que el recepcionista ve antes de confirmar es lo que se valida.
//
// Criterios de aceptacion de la historia y su capa de prueba:
//   CA-1 Extension de hospedaje exitosa       -> se prueba aqui (service)
//   CA-2 Sin disponibilidad para la extension -> se prueba aqui (service)
//   CA-3 Extension con cambio de tarifa        -> se prueba aqui (service)
//   CA-4 Reserva finalizada                    -> se prueba aqui (service)
//   CA-5 Cancelacion de la solicitud           -> el boton "Cancelar" es de
//        pantalla; aqui se prueba la garantia del backend en la que se
//        apoya: la cotizacion previa no modifica nada.
//
// -----------------------------------------------------------------------
// MISMA TECNICA QUE LAS PRUEBAS DE HU-001, HU-007, HU-013 Y HU-016
// -----------------------------------------------------------------------
// El service (codigo de PRODUCCION, no se toca) usa require('../../models'),
// CommonJS. Vitest no intercepta require(), asi que se pre-puebla
// require.cache con el mock ANTES de requerir el service. Tambien queda
// mockeado el AuditLog que usa cabinBilling.service.js para leer y escribir
// la "foto" del monto. La suite no necesita MySQL ni Docker.
//
// Ejecutar: (desde backend/)  npx vitest run tests/unit/cabinExtension.extendCabinStay.vitest.test.js --reporter=verbose

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  Booking: { findByPk: vi.fn(), findOne: vi.fn(), findAll: vi.fn() },
  Resource: { findOne: vi.fn() },
  ResourceBlock: { findOne: vi.fn() },
  CabinDetail: { findByPk: vi.fn() },
  Customer: { findByPk: vi.fn() },
  BookingExtensionRequest: { create: vi.fn() },
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

// Se requiere DESPUES de pre-poblar el cache.
const service = nodeRequire('../../src/modules/reservasCabina/cabinExtension.service');
const {
  addDays, todayInHotelTimeZone, toHotelDatetime,
} = nodeRequire('../../src/modules/reservasCabina/cabinStay.util');
const { Op } = nodeRequire('sequelize');

const {
  Booking, Resource, ResourceBlock, CabinDetail, Customer, BookingExtensionRequest, AuditLog, sequelize,
} = mockModels;

const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };

// -----------------------------------------------------------------------
// Datos base: estadia de 2 noches que empieza manana (fecha de Costa Rica)
// y se extiende 2 noches mas. Siempre futura, sin importar cuando corra.
// -----------------------------------------------------------------------
const CHECK_IN_DATE = addDays(todayInHotelTimeZone(), 1);
const CURRENT_CHECK_OUT_DATE = addDays(CHECK_IN_DATE, 2);
const NEW_CHECK_OUT_DATE = addDays(CURRENT_CHECK_OUT_DATE, 2);
const CURRENT_END = toHotelDatetime(CURRENT_CHECK_OUT_DATE, '11:00:00');
const NEW_END = toHotelDatetime(NEW_CHECK_OUT_DATE, '11:00:00');

const fakeCabin = { resourceId: 3, name: 'Cabina Almendro', resourceType: 'cabin', status: 'available' };
const fakeGuest = { customerId: 15, fullName: 'Laura Jimenez Mora', identificationNumber: '604950088' };

// "Foto" del monto guardada al registrar la reserva (HU-016):
// 2 noches x 35 000 = 70 000.
const recordedSnapshot = {
  auditId: 90,
  action: 'cabin_booking_created',
  details: JSON.stringify({ nights: 2, nightlyRate: 35000, totalAmount: 70000 }),
};

let booking;

// Reserva con un update() espia, como la instancia de Sequelize.
function buildBooking(overrides = {}) {
  return {
    bookingId: 70,
    resourceId: 3,
    customerId: 15,
    status: 'active',
    startDatetime: toHotelDatetime(CHECK_IN_DATE, '15:00:00'),
    endDatetime: CURRENT_END,
    update: vi.fn(async function update(values) { Object.assign(this, values); return this; }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  booking = buildBooking();
  sequelize.transaction.mockImplementation(async (callback) => callback(fakeTransaction));
  // Estado "feliz" por defecto.
  Booking.findByPk.mockImplementation(async () => booking);
  Resource.findOne.mockResolvedValue(fakeCabin);
  CabinDetail.findByPk.mockResolvedValue({ resourceId: 3, capacity: 2, pricePerNight: '35000.00' });
  Booking.findOne.mockResolvedValue(null); // sin reservas en las noches nuevas
  ResourceBlock.findOne.mockResolvedValue(null); // sin bloqueos
  AuditLog.findOne.mockResolvedValue(recordedSnapshot);
  AuditLog.create.mockResolvedValue({ auditId: 91 });
  Customer.findByPk.mockResolvedValue(fakeGuest);
  BookingExtensionRequest.create.mockImplementation(async (data) => ({ extensionId: 12, ...data }));
});

// Afirmacion comun: la reserva original no se toco.
function expectNothingWritten() {
  expect(booking.update).not.toHaveBeenCalled();
  expect(booking.endDatetime).toEqual(CURRENT_END);
  expect(BookingExtensionRequest.create).not.toHaveBeenCalled();
  expect(AuditLog.create).not.toHaveBeenCalled();
}

describe('cabinExtensionService.extendCabinStay / quoteCabinExtension (HU-127)', () => {
  // ---------------------------------------------------------------------
  // CA-1 Extension de hospedaje exitosa
  // ---------------------------------------------------------------------
  it('CP-127-01 CA-1 extension exitosa: actualiza la salida, recalcula el monto y registra la modificacion', async () => {
    const result = await service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE });

    // Se bloquea la cabina y se relee la reserva con bloqueo.
    expect(Resource.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: 'UPDATE' }));
    expect(Booking.findByPk).toHaveBeenLastCalledWith(70, { lock: 'UPDATE', transaction: fakeTransaction });
    // Nueva fecha de salida a las 11:00 (Costa Rica).
    expect(booking.update).toHaveBeenCalledWith({ endDatetime: NEW_END }, { transaction: fakeTransaction });
    // La solicitud queda aprobada en el mismo paso.
    expect(BookingExtensionRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: 70, requestedEndDatetime: NEW_END, status: 'approved',
    }), { transaction: fakeTransaction });
    // Registro de la modificacion con la nueva "foto" del monto.
    const [auditEntry] = AuditLog.create.mock.calls[0];
    expect(auditEntry).toMatchObject({ action: 'cabin_stay_extended', entityType: 'booking', entityId: 70 });
    expect(JSON.parse(auditEntry.details)).toMatchObject({
      extensionId: 12, extraNights: 2, extensionAmount: 70000, previousTotal: 70000, totalAmount: 140000,
    });

    expect(result.stay).toEqual({
      checkInDate: CHECK_IN_DATE,
      previousCheckOutDate: CURRENT_CHECK_OUT_DATE,
      newCheckOutDate: NEW_CHECK_OUT_DATE,
      extraNights: 2,
    });
    expect(result.amounts).toMatchObject({ extensionAmount: 70000, previousTotal: 70000, newTotal: 140000 });
    expect(result.extension).toMatchObject({ extensionId: 12, status: 'approved' });
  });

  it('CP-127-01b CA-1 una estadia con ingreso registrado (checked_in) tambien se extiende', async () => {
    booking = buildBooking({ status: 'checked_in' });

    const result = await service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE });

    expect(booking.update).toHaveBeenCalledWith({ endDatetime: NEW_END }, { transaction: fakeTransaction });
    expect(result.booking.status).toBe('checked_in');
  });

  // Validaciones previas sin CA propio: casos complementarios de CA-1.
  it('CP-127-01c CA-1 (complementario) reserva inexistente: DomainError 404', async () => {
    Booking.findByPk.mockResolvedValueOnce(null);

    await expect(service.extendCabinStay({ bookingId: 999, newCheckOutDate: NEW_CHECK_OUT_DATE }))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 404, message: 'La reserva indicada no existe.' });
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('CP-127-01d CA-1 (complementario) la nueva salida no es posterior a la actual: DomainError 422', async () => {
    await expect(service.extendCabinStay({ bookingId: 70, newCheckOutDate: CURRENT_CHECK_OUT_DATE }))
      .rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_EXTENSION_DATE',
        message: `La nueva fecha de salida debe ser posterior a la fecha de salida actual (${CURRENT_CHECK_OUT_DATE}).`,
      });
    expectNothingWritten();
  });

  it('CP-127-01e CA-1 (complementario) extension de mas de 30 noches: DomainError 422', async () => {
    await expect(service.extendCabinStay({ bookingId: 70, newCheckOutDate: addDays(CURRENT_CHECK_OUT_DATE, 31) }))
      .rejects.toMatchObject({ statusCode: 422, code: 'INVALID_EXTENSION_DATE' });
    expectNothingWritten();
  });

  // ---------------------------------------------------------------------
  // CA-2 Sin disponibilidad para la extension
  // ---------------------------------------------------------------------
  it('CP-127-02 CA-2 la cabina ya esta reservada en las noches nuevas: mensaje oficial y sin cambios', async () => {
    Booking.findOne.mockResolvedValueOnce({ bookingId: 81, status: 'active' });

    await expect(service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE }))
      .rejects.toMatchObject({
        name: 'DomainError',
        statusCode: 409,
        code: 'EXTENSION_NOT_AVAILABLE',
        message: 'No es posible extender la estadía porque la cabina no se encuentra disponible para la fecha solicitada',
      });
    // Solo se revisan las noches NUEVAS de ESTA cabina, sin compararse
    // contra la propia reserva.
    const overlapWhere = Booking.findOne.mock.calls[0][0].where;
    expect(overlapWhere.resourceId).toBe(3);
    expect(overlapWhere.bookingId[Op.ne]).toBe(70);
    expect(overlapWhere.endDatetime[Op.gt]).toEqual(CURRENT_END);
    expect(overlapWhere.startDatetime[Op.lt]).toEqual(NEW_END);
    // La reserva original se mantiene sin modificaciones.
    expectNothingWritten();
  });

  it('CP-127-02b CA-2 la cabina esta bloqueada en las noches nuevas: DomainError 409', async () => {
    ResourceBlock.findOne.mockResolvedValueOnce({ blockId: 9, reason: 'Mantenimiento' });

    await expect(service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE }))
      .rejects.toMatchObject({ statusCode: 409, code: 'EXTENSION_NOT_AVAILABLE' });
    expectNothingWritten();
  });

  it('CP-127-02c CA-2 la cabina esta fuera de servicio: DomainError 409', async () => {
    Resource.findOne.mockResolvedValue({ ...fakeCabin, status: 'maintenance' });

    await expect(service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE }))
      .rejects.toMatchObject({ statusCode: 409, code: 'EXTENSION_NOT_AVAILABLE' });
    expectNothingWritten();
  });

  // ---------------------------------------------------------------------
  // CA-3 Extension con cambio de tarifa
  // ---------------------------------------------------------------------
  it('CP-127-03 CA-3 tarifa nueva: solo las noches nuevas usan la tarifa vigente y se muestra el saldo', async () => {
    // La tarifa subio de 35 000 a 40 000 despues de registrar la reserva.
    CabinDetail.findByPk.mockResolvedValue({ resourceId: 3, capacity: 2, pricePerNight: '40000.00' });

    const result = await service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE });

    expect(result.amounts).toEqual({
      nightlyRate: 40000,
      extensionAmount: 80000, // 2 noches nuevas x 40 000
      previousTotal: 70000, // lo ya registrado NO se recalcula
      newTotal: 150000,
      pendingBalance: 150000,
      previousTotalIsEstimated: false,
    });
    // El total anterior sale de la ULTIMA foto registrada de la reserva.
    expect(AuditLog.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entityType: 'booking', entityId: 70 }),
      order: [['auditId', 'DESC']],
    }));
    // La nueva foto guarda el nuevo total.
    expect(JSON.parse(AuditLog.create.mock.calls[0][0].details)).toMatchObject({
      nightlyRate: 40000, previousTotal: 70000, totalAmount: 150000,
    });
  });

  it('CP-127-03b CA-3 reserva sin monto registrado: se estima con la tarifa vigente y se marca como estimado', async () => {
    CabinDetail.findByPk.mockResolvedValue({ resourceId: 3, capacity: 2, pricePerNight: '40000.00' });
    AuditLog.findOne.mockResolvedValueOnce(null);

    const result = await service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE });

    expect(result.amounts).toMatchObject({
      previousTotal: 80000, // 2 noches originales x 40 000 (estimado)
      extensionAmount: 80000,
      newTotal: 160000,
      previousTotalIsEstimated: true,
    });
  });

  // ---------------------------------------------------------------------
  // CA-4 Reserva finalizada
  // ---------------------------------------------------------------------
  it('CP-127-04 CA-4 reserva finalizada: mensaje oficial y no permite continuar', async () => {
    booking = buildBooking({ status: 'completed' });

    await expect(service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE }))
      .rejects.toMatchObject({
        name: 'DomainError',
        statusCode: 422,
        code: 'BOOKING_COMPLETED',
        message: 'No es posible extender una reserva finalizada',
      });
    // Se detiene antes de revisar disponibilidad.
    expect(Booking.findOne).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it('CP-127-04b CA-4 (complementario) reserva cancelada: tampoco se puede extender', async () => {
    booking = buildBooking({ status: 'cancelled' });

    await expect(service.extendCabinStay({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE }))
      .rejects.toMatchObject({
        statusCode: 422,
        code: 'BOOKING_NOT_EXTENDABLE',
        message: 'Solo se pueden extender reservas activas o con ingreso registrado.',
      });
    expectNothingWritten();
  });

  // ---------------------------------------------------------------------
  // CA-5 Cancelacion de la solicitud de extension
  // ---------------------------------------------------------------------
  it('CP-127-05 CA-5 la cotizacion previa no modifica la reserva: cancelar no deja cambios', async () => {
    const quote = await service.quoteCabinExtension({ bookingId: 70, newCheckOutDate: NEW_CHECK_OUT_DATE });

    // El recepcionista ve el resumen...
    expect(quote).toMatchObject({
      bookingId: 70,
      stay: { previousCheckOutDate: CURRENT_CHECK_OUT_DATE, newCheckOutDate: NEW_CHECK_OUT_DATE, extraNights: 2 },
      amounts: { extensionAmount: 70000, newTotal: 140000 },
    });
    // ...pero nada se escribe: sin transaccion, sin cambio de fecha, sin
    // solicitud ni auditoria. Si cancela, la reserva queda como estaba.
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expectNothingWritten();
  });
});
