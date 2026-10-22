'use strict';

// Pruebas unitarias de HU-008 (registrar plan de precios del salon).
// Unidad bajo prueba: createEventHallPlan() y createEventHallPlanRules.
// La capa de modelos se reemplaza con jest.mock(): no hace falta MySQL.
jest.mock('../../src/models', () => ({
  Resource: {
    findOne: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(),
  },
  EventHallPricingPlan: { findAll: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));

const { Resource, EventHallPricingPlan } = require('../../src/models');
const service = require('../../src/modules/reservasSalon/eventHallPlans.service');
const { createEventHallPlanRules } = require('../../src/modules/reservasSalon/eventHallPlans.validator');

const hall = { resourceId: 2, resourceType: 'event_hall' };

beforeEach(() => {
  jest.clearAllMocks();
  Resource.findAll.mockResolvedValue([hall]);
  Resource.findByPk.mockResolvedValue(hall);
  EventHallPricingPlan.findAll.mockResolvedValue([]);
  EventHallPricingPlan.create.mockImplementation(async (values) => ({ planId: 9, ...values }));
});

describe('PU-HU-008-CA1-01', () => {
  it('registra un plan valido y lo deja disponible de inmediato en el listado', async () => {
    const plan = await service.createEventHallPlan({
      planName: 'Plan Boda',
      hours: 10,
      price: 320000,
      includedServices: 'Mobiliario, Sonido',
      depositPercentage: 50,
    });

    expect(EventHallPricingPlan.create).toHaveBeenCalledTimes(1);
    expect(EventHallPricingPlan.create.mock.calls[0][0]).toEqual({
      resourceId: 2,
      planName: 'Plan Boda',
      hours: 10,
      price: 320000,
      includedServices: '["Mobiliario","Sonido"]',
      depositPercentage: 50,
      extraHourPrice: null,
    });
    expect(plan).toEqual({
      planId: 9,
      resourceId: 2,
      planName: 'Plan Boda',
      hours: 10,
      price: 320000,
      includedServices: ['Mobiliario', 'Sonido'],
      depositPercentage: 50,
      extraHourPrice: null,
    });

    // Disponible de inmediato: la consulta siguiente ya lo incluye.
    EventHallPricingPlan.findAll.mockResolvedValue([await EventHallPricingPlan.create.mock.results[0].value]);
    const listado = await service.listEventHallPlans({ resourceId: 2 });
    expect(listado.items.map((item) => item.planName)).toEqual(['Plan Boda']);
  });
});

describe('PU-HU-008-CA2-01', () => {
  it('rechaza un nombre repetido sin distinguir mayusculas/minusculas ni espacios extra', async () => {
    EventHallPricingPlan.findAll.mockResolvedValue([
      { planId: 1, planName: 'Medio dia' },
    ]);

    await expect(service.createEventHallPlan({ planName: 'MEDIO   DIA', hours: 6, price: 100000 }))
      .rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_PLAN_NAME',
        message: 'Ya existe un plan con ese nombre',
      });
    expect(EventHallPricingPlan.create).not.toHaveBeenCalled();
  });
});

describe('PU-HU-008-CA3-01', () => {
  it('con nombre, duracion y precio vacios informa los tres campos y no registra el plan', async () => {
    // 1. El validador marca todos los campos obligatorios pendientes.
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    for (const rule of createEventHallPlanRules) {
      await rule(req, res, next);
    }
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'El nombre del plan es obligatorio.',
        details: [
          { field: 'planName', message: 'El nombre del plan es obligatorio.' },
          { field: 'hours', message: 'La duración del plan en horas es obligatoria.' },
          { field: 'price', message: 'El precio del plan es obligatorio.' },
        ],
      },
    });

    // 2. Aunque se llame al service directamente, tampoco guarda nada.
    await expect(service.createEventHallPlan({}))
      .rejects.toMatchObject({ statusCode: 422, code: 'INVALID_PLAN' });
    expect(EventHallPricingPlan.create).not.toHaveBeenCalled();
  });
});
