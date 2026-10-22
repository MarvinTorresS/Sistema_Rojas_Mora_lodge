'use strict';

// Pruebas unitarias de HU-009 (consultar planes de precios del salon).
// Unidad bajo prueba: listEventHallPlans().
// La capa de modelos se reemplaza con jest.mock(): no hace falta MySQL.
jest.mock('../../src/models', () => ({
  Resource: {
    findOne: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(),
  },
  EventHallPricingPlan: { findAll: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn() },
}));

const { EventHallPricingPlan } = require('../../src/models');
const service = require('../../src/modules/reservasSalon/eventHallPlans.service');

// Planes estandar del salon (guardados fuera de orden a proposito).
const storedPlans = [
  {
    planId: 3, resourceId: 2, planName: 'Completo', hours: 12, price: '250000.00',
    includedServices: '["Mobiliario","Sonido"]', depositPercentage: null, extraHourPrice: null,
  },
  {
    planId: 1, resourceId: 2, planName: 'Básico', hours: 4, price: '100000.00',
    includedServices: '["Mobiliario","Sonido"]', depositPercentage: null, extraHourPrice: null,
  },
  {
    planId: 2, resourceId: 2, planName: 'Medio', hours: 8, price: '180000.00',
    includedServices: '["Mobiliario","Sonido"]', depositPercentage: null, extraHourPrice: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  EventHallPricingPlan.findAll.mockResolvedValue(storedPlans);
});

describe('PU-HU-009-CA1-01', () => {
  it('lista los planes con duracion, precio y servicios incluidos, ordenados por duracion', async () => {
    const resultado = await service.listEventHallPlans();

    expect(resultado.items.map((plan) => [plan.planName, plan.hours, plan.price])).toEqual([
      ['Básico', 4, 100000],
      ['Medio', 8, 180000],
      ['Completo', 12, 250000],
    ]);
    resultado.items.forEach((plan) => {
      expect(plan.includedServices).toEqual(['Mobiliario', 'Sonido']);
    });
    expect(resultado.total).toBe(3);
    expect(resultado.availableHours).toEqual([4, 8, 12]);
  });
});

describe('PU-HU-009-CA2-01', () => {
  it('con un horario sin planes devuelve lista vacia (la pantalla muestra el aviso) y no un error', async () => {
    const resultado = await service.listEventHallPlans({ hours: 6 });

    expect(resultado.items).toEqual([]);
    expect(resultado.total).toBe(0);
    // Hay planes en el catalogo: la lista vacia se debe al filtro de horario,
    // no a que el catalogo este vacio.
    expect(resultado.totalWithoutFilters).toBe(3);
    expect(resultado.availableHours).toEqual([4, 8, 12]);
  });
});
