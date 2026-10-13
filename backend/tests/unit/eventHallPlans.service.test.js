'use strict';

// Pruebas unitarias del CRUD de planes de precio del salon de eventos.
// Cubren HU-010 (buscar por nombre), HU-011 (editar) y HU-012 (eliminar
// permanentemente) -- Wagner, Sprint 2.
//
// Se MOCKEA la capa de modelos (../../src/models) para no tocar MySQL,
// igual que en reservasCancha.service.test.js: se verifica la logica de
// negocio (filtro de busqueda, deteccion de reservas asociadas, reglas
// de baja fisica condicionada), no la consulta SQL real.
//
// Ejecutar: (desde backend/)  pnpm test -- eventHallPlans

jest.mock('../../src/models', () => ({
  EventHallPricingPlan: { findAll: jest.fn(), findByPk: jest.fn() },
  Booking: { count: jest.fn() },
}));

const { EventHallPricingPlan, Booking } = require('../../src/models');
const {
  searchPlansByName, updateHallPlan, deleteHallPlan, mapPlan,
} = require('../../src/modules/reservasSalon/eventHallPlans.service');
const {
  searchPlansRules, updatePlanRules, deletePlanRules,
} = require('../../src/modules/reservasSalon/eventHallPlans.validator');

afterEach(() => {
  jest.clearAllMocks();
});

// Misma utilidad que en reservasCancha.service.test.js: corre una
// cadena de reglas de express-validator contra un req falso, sin
// levantar Express.
async function runValidator(rules, { query = {}, params = {}, body = {} } = {}) {
  const req = { query, params, body, cookies: {}, headers: {} };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalled = false;
  for (const rule of rules) {
    if (typeof rule.run === 'function') {
      await rule.run(req);
    } else {
      rule(req, res, () => { nextCalled = true; });
    }
  }
  return { nextCalled, statusCode: res.statusCode, body: res.body };
}

// Instancia falsa de EventHallPricingPlan. Una instancia REAL de
// Sequelize expone sus columnas como propiedades directas (plan.planId)
// Y a traves de `.get()`; el service usa ambas formas (plan.planId para
// las consultas de Booking, plan.get() via mapPlan para la respuesta),
// asi que el mock replica las dos. `update()`/`destroy()` mutan la
// misma instancia para que una lectura posterior refleje los cambios.
function makePlanInstance(overrides = {}) {
  const instance = {
    planId: 5, resourceId: 2, planName: 'Bronce', hours: 4, price: '150000.00', ...overrides,
  };
  instance.get = () => ({
    planId: instance.planId,
    resourceId: instance.resourceId,
    planName: instance.planName,
    hours: instance.hours,
    price: instance.price,
  });
  instance.update = jest.fn(async (fields) => { Object.assign(instance, fields); });
  instance.destroy = jest.fn(async () => {});
  return instance;
}

describe('mapPlan', () => {
  it('convierte price (DECIMAL como string) a numero', () => {
    const plan = { planId: 1, resourceId: 2, planName: 'Oro', hours: 6, price: '300000.00' };
    expect(mapPlan(plan)).toEqual({
      planId: 1, resourceId: 2, planName: 'Oro', hours: 6, price: 300000,
      includedServices: [], depositPercentage: null, extraHourPrice: null,
    });
  });

  it('acepta tanto una instancia Sequelize (.get) como un objeto plano', () => {
    const instance = makePlanInstance({ planName: 'Plata' });
    expect(mapPlan(instance).planName).toBe('Plata');
  });
});

// ---------------------------------------------------------------------
// HU-010 — Buscar un plan de precios por nombre
// ---------------------------------------------------------------------
describe('searchPlansByName (HU-010)', () => {
  it('CP-010-01 devuelve los planes mapeados que coinciden con el nombre', async () => {
    EventHallPricingPlan.findAll.mockResolvedValue([
      makePlanInstance({ planId: 1, planName: 'Plan Bronce' }),
      makePlanInstance({ planId: 2, planName: 'Plan Bronce Plus' }),
    ]);

    const result = await searchPlansByName({ name: 'Bronce' });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ planId: 1, planName: 'Plan Bronce' });
    const queryArg = EventHallPricingPlan.findAll.mock.calls[0][0];
    expect(queryArg.order).toEqual([['planName', 'ASC']]);
  });

  it('CP-010-02 sin resultados devuelve un arreglo vacio (no es un error)', async () => {
    EventHallPricingPlan.findAll.mockResolvedValue([]);
    const result = await searchPlansByName({ name: 'Inexistente' });
    expect(result).toEqual([]);
  });

  it('valida forma: name es obligatorio', async () => {
    const r = await runValidator(searchPlansRules, { query: {} });
    expect(r.statusCode).toBe(422);
    expect(r.body.error.details.some((d) => d.field === 'name')).toBe(true);
  });

  it('valida forma: name bien formado deja pasar', async () => {
    const r = await runValidator(searchPlansRules, { query: { name: 'Oro' } });
    expect(r.nextCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------
// HU-011 — Editar un plan de precios existente
// ---------------------------------------------------------------------
describe('updateHallPlan (HU-011)', () => {
  const payload = { planName: 'Plan Oro', hours: 6, price: 300000 };

  it('CP-011-01 edicion exitosa: actualiza el plan y no hay reservas futuras', async () => {
    const plan = makePlanInstance();
    EventHallPricingPlan.findByPk.mockResolvedValue(plan);
    Booking.count.mockResolvedValue(0);

    const result = await updateHallPlan(5, payload);

    expect(plan.update).toHaveBeenCalledWith(payload);
    expect(result.plan).toMatchObject(payload);
    expect(result.futureBookingsCount).toBe(0);
  });

  it('CP-011-02 edicion de un plan con reservas futuras: no bloquea, informa el conteo', async () => {
    const plan = makePlanInstance();
    EventHallPricingPlan.findByPk.mockResolvedValue(plan);
    Booking.count.mockResolvedValue(3);

    const result = await updateHallPlan(5, payload);

    expect(plan.update).toHaveBeenCalled();
    expect(result.futureBookingsCount).toBe(3);
    const countArgs = Booking.count.mock.calls[0][0];
    expect(countArgs.where.eventHallPlanId).toBe(5);
  });

  it('plan inexistente devuelve DomainError 404 y no intenta actualizar', async () => {
    EventHallPricingPlan.findByPk.mockResolvedValue(null);
    await expect(updateHallPlan(999, payload))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 404 });
    expect(Booking.count).not.toHaveBeenCalled();
  });

  it('CP-011-03 (forma) campos obligatorios incompletos -> 422', async () => {
    const r = await runValidator(updatePlanRules, {
      params: { planId: '5' }, body: { planName: 'Solo nombre' },
    });
    expect(r.statusCode).toBe(422);
    const fields = r.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['hours', 'price']));
  });

  it('valida forma: planId debe ser entero positivo', async () => {
    const r = await runValidator(updatePlanRules, {
      params: { planId: 'abc' }, body: payload,
    });
    expect(r.statusCode).toBe(422);
  });

  it('valida forma: cuerpo completo y planId valido dejan pasar', async () => {
    const r = await runValidator(updatePlanRules, { params: { planId: '5' }, body: payload });
    expect(r.nextCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------
// HU-012 — Eliminar de forma permanente un plan de precios
// ---------------------------------------------------------------------
describe('deleteHallPlan (HU-012)', () => {
  it('CP-012-01 eliminacion exitosa cuando no hay ninguna reserva asociada', async () => {
    const plan = makePlanInstance();
    EventHallPricingPlan.findByPk.mockResolvedValue(plan);
    Booking.count.mockResolvedValueOnce(0); // total asociadas

    const result = await deleteHallPlan(5);

    expect(plan.destroy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ planId: 5 });
    // Al no haber ninguna asociada, nunca hace falta el segundo conteo
    // (solo activas), asi que Booking.count se llama una sola vez.
    expect(Booking.count).toHaveBeenCalledTimes(1);
  });

  it('CP-012-02 rechaza eliminar un plan con reservas activas asociadas (409) y no borra', async () => {
    const plan = makePlanInstance();
    EventHallPricingPlan.findByPk.mockResolvedValue(plan);
    Booking.count
      .mockResolvedValueOnce(2) // total asociadas
      .mockResolvedValueOnce(2); // activas

    await expect(deleteHallPlan(5)).rejects.toMatchObject({ name: 'DomainError', statusCode: 409 });
    expect(plan.destroy).not.toHaveBeenCalled();
  });

  it('rechaza eliminar (409) si solo tiene reservas asociadas en el historial (no activas)', async () => {
    const plan = makePlanInstance();
    EventHallPricingPlan.findByPk.mockResolvedValue(plan);
    Booking.count
      .mockResolvedValueOnce(4) // total asociadas (completadas/canceladas)
      .mockResolvedValueOnce(0); // activas

    const error = await deleteHallPlan(5).catch((e) => e);
    expect(error).toMatchObject({ name: 'DomainError', statusCode: 409 });
    expect(error.message).toMatch(/historial/);
    expect(plan.destroy).not.toHaveBeenCalled();
  });

  it('plan inexistente devuelve DomainError 404 y no consulta reservas', async () => {
    EventHallPricingPlan.findByPk.mockResolvedValue(null);
    await expect(deleteHallPlan(999)).rejects.toMatchObject({ name: 'DomainError', statusCode: 404 });
    expect(Booking.count).not.toHaveBeenCalled();
  });

  it('valida forma: planId debe ser entero positivo', async () => {
    const r = await runValidator(deletePlanRules, { params: { planId: '0' } });
    expect(r.statusCode).toBe(422);
  });

  it('valida forma: planId valido deja pasar', async () => {
    const r = await runValidator(deletePlanRules, { params: { planId: '5' } });
    expect(r.nextCalled).toBe(true);
  });
});
