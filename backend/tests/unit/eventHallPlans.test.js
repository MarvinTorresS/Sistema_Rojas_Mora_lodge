'use strict';

// HU-008 (registrar plan) y HU-009 (listar planes) -- Sprint 2.
jest.mock('../../src/models', () => ({
  Resource: {
    findOne: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(),
  },
  EventHallPricingPlan: { findAll: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const request = require('supertest');
const app = require('../../src/app');
const { Resource, EventHallPricingPlan } = require('../../src/models');
const util = require('../../src/modules/reservasSalon/eventHallPlans.util');

const base = '/api/event-hall-plans';
const hall = { resourceId: 2, resourceType: 'event_hall' };
const stored = [
  {
    planId: 2, resourceId: 2, planName: 'Dia completo', hours: 12, price: '250000.00',
    includedServices: '["Mobiliario","Sonido"]', depositPercentage: '40.00',
  },
  {
    planId: 1, resourceId: 2, planName: 'Medio dia', hours: 6, price: '150000.00',
    includedServices: null, depositPercentage: null,
  },
  {
    planId: 3, resourceId: 2, planName: 'Evento corto', hours: 6, price: '90000.00',
    includedServices: null, depositPercentage: null,
  },
];

const validBody = {
  planName: 'Plan Boda', hours: 10, price: 320000, includedServices: 'Mobiliario, Sonido', depositPercentage: 50,
};

beforeEach(() => {
  jest.clearAllMocks();
  Resource.findOne.mockResolvedValue(hall);
  Resource.findAll.mockResolvedValue([hall]);
  Resource.findByPk.mockResolvedValue(hall);
  Resource.create.mockImplementation(async (values) => ({ resourceId: values.resourceId ?? 5, ...values }));
  EventHallPricingPlan.findAll.mockResolvedValue(stored);
  EventHallPricingPlan.create.mockImplementation(async (values) => ({ planId: 9, ...values }));
});

describe('HU-009 listar planes de precios del salon', () => {
  it('CA-1 devuelve nombre, duracion, precio y servicios, ordenados por duracion y precio', async () => {
    const result = await request(app).get(base);
    expect(result.status).toBe(200);
    expect(result.body.data.map((plan) => plan.planName)).toEqual(['Evento corto', 'Medio dia', 'Dia completo']);
    expect(result.body.data[2]).toEqual({
      planId: 2, resourceId: 2, planName: 'Dia completo', hours: 12, price: 250000,
      includedServices: ['Mobiliario', 'Sonido'], depositPercentage: 40, extraHourPrice: null,
    });
    expect(result.body.data[0].includedServices).toEqual([]);
    expect(result.body.data[0].depositPercentage).toBeNull();
    expect(result.body.meta).toMatchObject({ total: 3, totalWithoutFilters: 3, availableHours: [6, 12] });
  });

  it('CA-2 filtra por duracion en horas', async () => {
    const result = await request(app).get(`${base}?hours=6`);
    expect(result.status).toBe(200);
    expect(result.body.data.map((plan) => plan.planId)).toEqual([3, 1]);
    // Las duraciones disponibles no cambian con el filtro: la pantalla las
    // usa para dibujar los filtros.
    expect(result.body.meta).toMatchObject({ total: 2, totalWithoutFilters: 3, availableHours: [6, 12] });
  });

  it('filtra por texto sin distinguir mayusculas', async () => {
    const result = await request(app).get(`${base}?search=COMPLETO`);
    expect(result.body.data.map((plan) => plan.planId)).toEqual([2]);
  });

  it('CA-3 sin planes responde lista vacia y no un error', async () => {
    EventHallPricingPlan.findAll.mockResolvedValue([]);
    const result = await request(app).get(base);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: [], meta: { total: 0, availableHours: [] } });
  });

  it('filtra por salon en la consulta', async () => {
    await request(app).get(`${base}?resourceId=2`);
    expect(EventHallPricingPlan.findAll.mock.calls[0][0].where).toEqual({ resourceId: 2 });
  });

  it('rechaza filtros con formato invalido', async () => {
    expect((await request(app).get(`${base}?hours=abc`)).status).toBe(422);
    expect((await request(app).get(`${base}?hours=99`)).status).toBe(422);
    expect((await request(app).get(`${base}?resourceId=0`)).status).toBe(422);
  });

  it('tolera planes anteriores sin servicios y servicios guardados como texto simple', async () => {
    EventHallPricingPlan.findAll.mockResolvedValue([
      { planId: 5, resourceId: 2, planName: 'Viejo', hours: 4, price: '1000.00', includedServices: 'Sillas, Mesas', depositPercentage: null },
    ]);
    const result = await request(app).get(base);
    expect(result.body.data[0].includedServices).toEqual(['Sillas', 'Mesas']);
  });
});

describe('HU-008 registrar un plan de precios', () => {
  it('CA-1 guarda el plan completo y responde 201', async () => {
    const result = await request(app).post(base).send(validBody);
    expect(result.status).toBe(201);
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
    expect(result.body.data).toMatchObject({
      planId: 9, planName: 'Plan Boda', hours: 10, price: 320000,
      includedServices: ['Mobiliario', 'Sonido'], depositPercentage: 50,
    });
  });

  it('los servicios y el anticipo son opcionales', async () => {
    const result = await request(app).post(base).send({ planName: 'Plan Simple', hours: '4', price: '80000.50' });
    expect(result.status).toBe(201);
    const saved = EventHallPricingPlan.create.mock.calls[0][0];
    expect(saved).toMatchObject({ hours: 4, price: 80000.5, includedServices: null, depositPercentage: null });
  });

  it('limpia espacios del nombre y bloquea la fila del salon', async () => {
    await request(app).post(base).send({ ...validBody, planName: '   Plan    Boda  ' });
    expect(EventHallPricingPlan.create.mock.calls[0][0].planName).toBe('Plan Boda');
    expect(Resource.findByPk.mock.calls[0][1]).toMatchObject({ lock: 'UPDATE' });
  });

  it('CA-2 rechaza un nombre repetido sin distinguir mayusculas/minusculas', async () => {
    const result = await request(app).post(base).send({ ...validBody, planName: 'DIA   completo' });
    expect(result.status).toBe(409);
    expect(result.body.error).toMatchObject({
      message: 'Ya existe un plan con ese nombre',
      code: 'DUPLICATE_PLAN_NAME',
    });
    expect(EventHallPricingPlan.create).not.toHaveBeenCalled();
  });

  it('CA-2 compara tildes tal cual (Día y Dia son nombres distintos)', async () => {
    const result = await request(app).post(base).send({ ...validBody, planName: 'Día completo' });
    expect(result.status).toBe(201);
  });

  it.each([
    ['nombre', { planName: '' }, 'El nombre del plan es obligatorio.'],
    ['nombre muy corto', { planName: 'ab' }, 'El nombre del plan debe tener entre 3 y 50 caracteres.'],
    ['nombre muy largo', { planName: 'a'.repeat(51) }, 'El nombre del plan debe tener entre 3 y 50 caracteres.'],
    ['duracion', { hours: undefined }, 'La duración del plan en horas es obligatoria.'],
    ['duracion cero', { hours: 0 }, 'La duración debe ser un número entero de horas entre 1 y 24.'],
    ['duracion mayor a un dia', { hours: 25 }, 'La duración debe ser un número entero de horas entre 1 y 24.'],
    ['duracion decimal', { hours: 2.5 }, 'La duración debe ser un número entero de horas entre 1 y 24.'],
    ['precio', { price: undefined }, 'El precio del plan es obligatorio.'],
    ['precio cero', { price: 0 }, 'El precio debe ser un monto mayor a cero.'],
    ['precio negativo', { price: -5 }, 'El precio debe ser un monto mayor a cero.'],
    ['precio texto', { price: 'barato' }, 'El precio debe ser un monto mayor a cero.'],
    ['precio con 3 decimales', { price: 10.123 }, 'El precio admite como máximo 2 decimales.'],
    ['anticipo mayor a 100', { depositPercentage: 101 }, 'El porcentaje de anticipo debe estar entre 0 y 100.'],
    ['anticipo negativo', { depositPercentage: -1 }, 'El porcentaje de anticipo debe estar entre 0 y 100.'],
    ['servicios no texto', { includedServices: 5 }, 'Los servicios incluidos deben ser una lista de textos.'],
  ])('CA-3 rechaza %s con 422 y sin guardar', async (_name, override, message) => {
    const result = await request(app).post(base).send({ ...validBody, ...override });
    expect(result.status).toBe(422);
    expect(result.body.error.message).toBe(message);
    expect(EventHallPricingPlan.create).not.toHaveBeenCalled();
  });

  it('CA-3 informa todos los campos faltantes a la vez', async () => {
    const result = await request(app).post(base).send({});
    expect(result.status).toBe(422);
    expect(result.body.error.details.map((detail) => detail.field)).toEqual(['planName', 'hours', 'price']);
  });

  it('404 si el salon indicado no existe', async () => {
    Resource.findOne.mockResolvedValue(null);
    const result = await request(app).post(base).send({ ...validBody, resourceId: 77 });
    expect(result.status).toBe(404);
  });

  it('revisa los nombres existentes con lectura bloqueada (ve lo ultimo guardado por otra solicitud)', async () => {
    await request(app).post(base).send(validBody);
    const options = EventHallPricingPlan.findAll.mock.calls[0][0];
    expect(options.lock).toBe('UPDATE');
  });

  it('si la base aun no tiene el salon, lo registra (id 2) y guarda el plan', async () => {
    Resource.findAll.mockResolvedValue([]);
    Resource.findByPk.mockResolvedValue(null);
    const result = await request(app).post(base).send(validBody);
    expect(result.status).toBe(201);
    expect(Resource.create).toHaveBeenCalledTimes(1);
    expect(Resource.create.mock.calls[0][0]).toMatchObject({
      resourceId: 2, resourceType: 'event_hall', status: 'available',
    });
    expect(EventHallPricingPlan.create.mock.calls[0][0]).toMatchObject({ resourceId: 2, planName: 'Plan Boda' });
  });

  it('si el id 2 lo ocupa otro recurso, el salon nuevo toma el id que asigne la base', async () => {
    Resource.findAll.mockResolvedValue([]);
    Resource.findByPk.mockResolvedValue({ resourceId: 2, resourceType: 'cabin' });
    const result = await request(app).post(base).send(validBody);
    expect(result.status).toBe(201);
    expect(Resource.create.mock.calls[0][0]).not.toHaveProperty('resourceId');
    expect(EventHallPricingPlan.create.mock.calls[0][0]).toMatchObject({ resourceId: 5 });
  });

  it('si otra solicitud registro el salon al mismo tiempo, usa ese', async () => {
    Resource.findAll.mockResolvedValue([]);
    Resource.findByPk.mockResolvedValue(null);
    Resource.create.mockRejectedValue(new Error('Duplicate entry'));
    Resource.findOne.mockResolvedValue({ resourceId: 2, resourceType: 'event_hall' });
    const result = await request(app).post(base).send(validBody);
    expect(result.status).toBe(201);
    expect(EventHallPricingPlan.create.mock.calls[0][0]).toMatchObject({ resourceId: 2 });
  });

  it('pide el salon si hay varios y no se indico', async () => {
    Resource.findAll.mockResolvedValue([hall, { resourceId: 8, resourceType: 'event_hall' }]);
    const result = await request(app).post(base).send(validBody);
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('HALL_NOT_SPECIFIED');
  });
});

describe('base de datos sin migrar', () => {
  const outdated = () => Object.assign(new Error("Unknown column 'included_services' in 'field list'"), {
    parent: { code: 'ER_BAD_FIELD_ERROR' },
  });

  it('listar: avisa que falta correr pnpm migrate en vez del texto tecnico de MySQL', async () => {
    EventHallPricingPlan.findAll.mockRejectedValue(outdated());
    const result = await request(app).get(base);
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('DATABASE_OUTDATED');
    expect(result.body.error.message).toContain('pnpm migrate');
    expect(result.body.error.message).not.toContain('Unknown column');
  });

  it('registrar: lo mismo si falta una tabla', async () => {
    EventHallPricingPlan.findAll.mockRejectedValue(Object.assign(new Error('x'), { parent: { code: 'ER_NO_SUCH_TABLE' } }));
    const result = await request(app).post(base).send(validBody);
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('DATABASE_OUTDATED');
  });

  it('otros errores de base no se disfrazan', async () => {
    EventHallPricingPlan.findAll.mockRejectedValue(Object.assign(new Error('Lock wait timeout'), { parent: { code: 'ER_LOCK_WAIT_TIMEOUT' } }));
    const result = await request(app).get(base);
    expect(result.status).toBe(500);
    expect(result.body.error.message).toBe('Lock wait timeout');
  });
});

describe('eventHallPlans.util', () => {
  it('normaliza servicios sin vacios ni repetidos', () => {
    expect(util.normalizeIncludedServices(' Sonido ,sonido;; Mesas\nSillas ').services).toEqual(['Sonido', 'Mesas', 'Sillas']);
    expect(util.normalizeIncludedServices(['A', 'a', ' B ']).services).toEqual(['A', 'B']);
    expect(util.normalizeIncludedServices('').services).toEqual([]);
    expect(util.normalizeIncludedServices(null).error).toBeNull();
    expect(util.normalizeIncludedServices([1]).error).toMatch(/texto/);
  });

  it('limita cantidad y largo de los servicios', () => {
    const many = Array.from({ length: 21 }, (_, i) => `S${i}`);
    expect(util.normalizeIncludedServices(many).error).toMatch(/máximo 20/);
    expect(util.normalizeIncludedServices('x'.repeat(61)).error).toMatch(/60 caracteres/);
  });

  it('serializa y lee servicios', () => {
    expect(util.serializeServices([])).toBeNull();
    expect(util.parseStoredServices(util.serializeServices(['A', 'B']))).toEqual(['A', 'B']);
    expect(util.parseStoredServices(null)).toEqual([]);
  });

  it('el anticipo vacio es valido y se redondea a 2 decimales', () => {
    expect(util.normalizeDepositPercentage('')).toEqual({ percentage: null, error: null });
    expect(util.normalizeDepositPercentage('12.5')).toEqual({ percentage: 12.5, error: null });
    expect(util.normalizeDepositPercentage(0)).toEqual({ percentage: 0, error: null });
    expect(util.normalizeDepositPercentage('abc').error).not.toBeNull();
    expect(util.normalizeDepositPercentage(10.123).error).toMatch(/2 decimales/);
  });

  it('parseHours solo acepta enteros', () => {
    expect(util.parseHours('12')).toBe(12);
    expect(Number.isNaN(util.parseHours(true))).toBe(true);
    expect(Number.isNaN(util.parseHours(''))).toBe(true);
    expect(Number.isNaN(util.parseHours('1.5'))).toBe(true);
  });
});

describe('HU-008 costo por hora extra del plan', () => {
  it('es opcional: sin costo el plan no admite horas extra (null)', async () => {
    const result = await request(app).post(base).send(validBody);
    expect(result.status).toBe(201);
    expect(EventHallPricingPlan.create.mock.calls[0][0].extraHourPrice).toBeNull();
    expect(result.body.data.extraHourPrice).toBeNull();
  });

  it('guarda el costo por hora extra y lo devuelve como numero', async () => {
    const result = await request(app).post(base).send({ ...validBody, extraHourPrice: '15000.50' });
    expect(result.status).toBe(201);
    expect(EventHallPricingPlan.create.mock.calls[0][0].extraHourPrice).toBe(15000.5);
    expect(result.body.data.extraHourPrice).toBe(15000.5);
  });

  it('el listado incluye el costo por hora extra de cada plan', async () => {
    EventHallPricingPlan.findAll.mockResolvedValue([
      { ...stored[1], extraHourPrice: '12000.00' }, stored[0],
    ]);
    const result = await request(app).get(base);
    const byName = Object.fromEntries(result.body.data.map((plan) => [plan.planName, plan.extraHourPrice]));
    expect(byName).toEqual({ 'Medio dia': 12000, 'Dia completo': null });
  });

  it.each([0, -5, 'abc', '12.345', 100000000, true, []])('rechaza costo por hora extra %j', async (extraHourPrice) => {
    const result = await request(app).post(base).send({ ...validBody, extraHourPrice });
    expect(result.status).toBe(422);
    expect(result.body.error.details[0].field).toBe('extraHourPrice');
    expect(EventHallPricingPlan.create).not.toHaveBeenCalled();
  });

  it('normalizeExtraHourPrice acepta vacios como "sin costo"', () => {
    expect(util.normalizeExtraHourPrice('')).toEqual({ price: null, error: null });
    expect(util.normalizeExtraHourPrice(null)).toEqual({ price: null, error: null });
    expect(util.normalizeExtraHourPrice(undefined)).toEqual({ price: null, error: null });
    expect(util.normalizeExtraHourPrice('8000')).toEqual({ price: 8000, error: null });
  });
});
