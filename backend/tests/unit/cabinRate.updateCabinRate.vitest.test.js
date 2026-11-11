import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-128 (Marvin, Sprint 3) — Editar la tarifa por noche
// de una cabina.
//
// Unidades bajo prueba:
//   - updateCabinRate()       en cabinRate.service.js (CA-1, CA-2, CA-3).
//   - getRecordedStayTotal()  en cabinBilling.service.js (CA-3): es la
//     funcion que lee el monto YA registrado de una reserva; demuestra que
//     una tarifa nueva no altera ese monto.
//
// Criterios de aceptacion de la historia y su capa de prueba:
//   CA-1 Edicion exitosa de la tarifa    -> se prueba aqui (service)
//   CA-2 Tarifa invalida                 -> se prueba aqui (service; usa la
//        misma regla getNightlyRateError que el validator)
//   CA-3 Reservas existentes sin cambios -> se prueba aqui (service)
//   CA-4 Cancelacion de la edicion       -> NO se prueba aqui: es una accion
//        de pantalla que no llama al backend.
//
// -----------------------------------------------------------------------
// MISMA TECNICA QUE LAS DEMAS PRUEBAS VITEST DEL PROYECTO
// -----------------------------------------------------------------------
// Se pre-puebla require.cache con el mock de ../../models ANTES de requerir
// los services (CommonJS), para que su require('../../models') interno
// resuelva contra el mock. La suite no necesita MySQL ni Docker.
//
// Ejecutar: (desde backend/)  npx vitest run tests/unit/cabinRate.updateCabinRate.vitest.test.js --reporter=verbose

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  Resource: { findOne: vi.fn(), findAll: vi.fn() },
  CabinDetail: { findByPk: vi.fn() },
  // Booking se incluye solo para comprobar que NUNCA se toca (CA-3).
  Booking: { update: vi.fn(), findAll: vi.fn(), findOne: vi.fn() },
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

// Se requieren DESPUES de pre-poblar el cache.
const rateService = nodeRequire('../../src/modules/reservasCabina/cabinRate.service');
const billingService = nodeRequire('../../src/modules/reservasCabina/cabinBilling.service');

const {
  Resource, CabinDetail, Booking, AuditLog, sequelize,
} = mockModels;

const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
const INVALID_RATE_MESSAGE = 'La tarifa debe ser un monto mayor a cero';

// Igual que la cabina 3 del seeder (capacidad 2, 35 000 por noche).
const fakeCabin = { resourceId: 3, name: 'Cabina Almendro', resourceType: 'cabin', status: 'available' };
let cabinDetail;

beforeEach(() => {
  vi.clearAllMocks();
  sequelize.transaction.mockImplementation(async (callback) => callback(fakeTransaction));
  Resource.findOne.mockResolvedValue(fakeCabin);
  // Detalle con update() espia, como la instancia de Sequelize. Sequelize
  // devuelve DECIMAL como string; despues del update queda el numero.
  cabinDetail = {
    resourceId: 3,
    capacity: 2,
    pricePerNight: '35000.00',
    update: vi.fn(async function update(values) { Object.assign(this, values); return this; }),
  };
  CabinDetail.findByPk.mockResolvedValue(cabinDetail);
  AuditLog.create.mockResolvedValue({ auditId: 120 });
});

describe('cabinRateService.updateCabinRate (HU-128)', () => {
  // ---------------------------------------------------------------------
  // CA-1 Edicion exitosa de la tarifa
  // ---------------------------------------------------------------------
  it('CP-128-01 CA-1 edicion exitosa: actualiza la tarifa y registra la modificacion', async () => {
    const result = await rateService.updateCabinRate({ resourceId: 3, pricePerNight: 40000 });

    // La cabina se lee con bloqueo de fila dentro de la transaccion.
    expect(Resource.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { resourceId: 3, resourceType: 'cabin' },
      lock: 'UPDATE',
    }));
    expect(cabinDetail.update).toHaveBeenCalledWith({ pricePerNight: 40000 }, { transaction: fakeTransaction });
    // Registro de la modificacion (la fecha y hora las pone la tabla).
    expect(AuditLog.create).toHaveBeenCalledWith({
      userId: null,
      action: 'cabin_rate_updated',
      entityType: 'resource',
      entityId: 3,
      details: JSON.stringify({ previousPricePerNight: 35000, newPricePerNight: 40000 }),
    }, { transaction: fakeTransaction });

    expect(result).toEqual({
      changed: true,
      cabin: {
        resourceId: 3, name: 'Cabina Almendro', status: 'available', capacity: 2, pricePerNight: 40000,
      },
      previousPricePerNight: 35000,
    });
  });

  it('CP-128-01b CA-1 tarifa escrita como texto con decimales: se guarda como monto', async () => {
    const result = await rateService.updateCabinRate({ resourceId: 3, pricePerNight: '42500.50' });

    expect(cabinDetail.update).toHaveBeenCalledWith({ pricePerNight: 42500.5 }, { transaction: fakeTransaction });
    expect(result.cabin.pricePerNight).toBe(42500.5);
  });

  // Casos sin CA propio en la historia: complementarios de CA-1.
  it('CP-128-01c CA-1 (complementario) cabina inexistente: DomainError 404', async () => {
    Resource.findOne.mockResolvedValueOnce(null);

    await expect(rateService.updateCabinRate({ resourceId: 99, pricePerNight: 40000 }))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 404, message: 'La cabina indicada no existe.' });
    expect(cabinDetail.update).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('CP-128-01d CA-1 (complementario) misma tarifa: responde sin escribir nada (idempotente)', async () => {
    const result = await rateService.updateCabinRate({ resourceId: 3, pricePerNight: 35000 });

    expect(result.changed).toBe(false);
    expect(result.cabin.pricePerNight).toBe(35000);
    expect(cabinDetail.update).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // CA-2 Tarifa invalida (vacia, cero, negativa o no numerica)
  // ---------------------------------------------------------------------
  // Afirmacion comun: se rechaza con el mensaje del CA y no se toca nada
  // (ni siquiera se abre la transaccion).
  async function expectInvalidRate(pricePerNight, message = INVALID_RATE_MESSAGE) {
    await expect(rateService.updateCabinRate({ resourceId: 3, pricePerNight }))
      .rejects.toMatchObject({
        name: 'DomainError', statusCode: 422, code: 'INVALID_RATE', message,
      });
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(cabinDetail.update).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  }

  it('CP-128-02 CA-2 tarifa vacia: DomainError 422 y la tarifa no cambia', async () => {
    await expectInvalidRate('');
    await expectInvalidRate(null);
  });

  it('CP-128-02b CA-2 tarifa en cero: DomainError 422 y la tarifa no cambia', async () => {
    await expectInvalidRate(0);
    await expectInvalidRate('0');
  });

  it('CP-128-02c CA-2 tarifa negativa: DomainError 422 y la tarifa no cambia', async () => {
    await expectInvalidRate(-5000);
    await expectInvalidRate('-5000');
  });

  it('CP-128-02d CA-2 tarifa no numerica: DomainError 422 y la tarifa no cambia', async () => {
    await expectInvalidRate('abc');
    await expectInvalidRate('35.000,50');
    await expectInvalidRate(true);
  });

  it('CP-128-02e CA-2 (complementario) mas de 2 decimales o por encima del tope: DomainError 422', async () => {
    await expectInvalidRate(35000.555, 'La tarifa admite como maximo 2 decimales.');
    await expectInvalidRate(100000000, 'La tarifa no puede superar los 99 999 999,99 colones.');
  });

  // ---------------------------------------------------------------------
  // CA-3 Reservas existentes sin cambios
  // ---------------------------------------------------------------------
  it('CP-128-03 CA-3 cambiar la tarifa no toca ninguna reserva registrada', async () => {
    await rateService.updateCabinRate({ resourceId: 3, pricePerNight: 40000 });

    // Solo cambia el detalle de la cabina; ninguna reserva se lee ni se
    // actualiza.
    expect(cabinDetail.update).toHaveBeenCalledTimes(1);
    expect(Booking.update).not.toHaveBeenCalled();
    expect(Booking.findAll).not.toHaveBeenCalled();
    expect(Booking.findOne).not.toHaveBeenCalled();
    // La auditoria es de la CABINA (resource), con una accion distinta de
    // las de reservas, asi que no entra al calculo de montos.
    const [auditEntry] = AuditLog.create.mock.calls[0];
    expect(auditEntry.entityType).toBe('resource');
    expect(Object.values(billingService.CABIN_AUDIT_ACTIONS)).not.toContain(auditEntry.action);
  });

  it('CP-128-03b CA-3 el monto ya registrado de una reserva se conserva con la tarifa nueva', async () => {
    // Reserva registrada con 35 000: 2 noches = 70 000. Hoy la tarifa es
    // 40 000, asi que recalcular daria 80 000 (fallbackTotal).
    AuditLog.findOne.mockResolvedValueOnce({
      auditId: 95,
      action: 'cabin_booking_created',
      details: JSON.stringify({ nights: 2, nightlyRate: 35000, totalAmount: 70000 }),
    });

    const recorded = await billingService.getRecordedStayTotal({ bookingId: 60, fallbackTotal: 80000 });

    expect(recorded).toEqual({ totalAmount: 70000, isEstimated: false });
    // Solo cuentan las acciones de reservas, nunca el cambio de tarifa.
    const { where } = AuditLog.findOne.mock.calls[0][0];
    expect(where).toMatchObject({ entityType: 'booking', entityId: 60 });
    expect(where.action).not.toContain('cabin_rate_updated');
  });
});
