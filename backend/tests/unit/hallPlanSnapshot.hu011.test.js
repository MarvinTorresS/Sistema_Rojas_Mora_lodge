'use strict';

jest.mock('../../src/models', () => ({
  AuditLog: { create: jest.fn(), findAll: jest.fn() },
  Booking: { create: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn() },
  Resource: { findOne: jest.fn() }, ResourceBlock: { findOne: jest.fn() },
  Customer: { findOrCreate: jest.fn() },
  EventHallPricingPlan: { findOne: jest.fn(), findAll: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
const models = require('../../src/models');
const { createHallBooking, getHallBooking, updateHallBooking, listHallBookings } = require('../../src/modules/reservasSalon/reservasSalon.service');
const { snapshotHallPlan } = require('../../src/modules/reservasSalon/hallPlanSnapshot.util');

let plan;
let booking;
let entries;
beforeEach(() => {
  jest.clearAllMocks();
  const start = new Date(Date.now() + 86400000);
  plan = { planId: 1, resourceId: 2, planName: 'Oro', hours: 4, price: '150000.00', extraHourPrice: '10000.00' };
  booking = {
    bookingId: 7, resourceId: 2, customerId: 3, eventHallPlanId: 1,
    status: 'active', extraHours: 1, startDatetime: start,
    endDatetime: new Date(start.getTime() + 5 * 3600000),
    eventHallPlan: plan, resource: { resourceId: 2, name: 'Salon' },
    save: jest.fn(),
  };
  entries = [{ auditId: 1, entityId: 7, details: JSON.stringify({ plan: snapshotHallPlan(plan) }) }];
  models.AuditLog.findAll.mockImplementation(async () => [...entries].reverse());
  models.AuditLog.create.mockImplementation(async (entry) => {
    entries.push({ auditId: entries.length + 1, ...entry });
  });
  models.Resource.findOne.mockResolvedValue({ resourceId: 2, status: 'available' });
  models.ResourceBlock.findOne.mockResolvedValue(null);
  models.Customer.findOrCreate.mockResolvedValue([{ customerId: 3 }]);
  models.EventHallPricingPlan.findOne.mockResolvedValue(plan);
  models.EventHallPricingPlan.findAll.mockResolvedValue([plan]);
  models.Booking.create.mockImplementation(async (data) => ({ bookingId: 7, ...data }));
  models.Booking.findOne.mockImplementation(async (options) => options.include ? booking : null);
  models.Booking.findByPk.mockResolvedValue(booking);
  models.Booking.findAndCountAll.mockResolvedValue({ rows: [booking], count: 1 });
});

test('una reserva nueva conserva el precio y las horas contratadas', async () => {
  const result = await createHallBooking({ resourceId: 2, planId: 1, customerName: 'Wagner', customerPhone: '88888888', startDatetime: booking.startDatetime, endDatetime: booking.endDatetime, extraHours: 1 });
  expect(JSON.parse(entries.at(-1).details).plan).toMatchObject({ price: 150000, hours: 4, extraHourPrice: 10000 });
  expect(models.Booking.create.mock.calls[0][0]).not.toHaveProperty('hallPlanSnapshot');
  expect(result.totalPrice).toBe(160000);
});

test('subir precio, duracion y horas extra del catalogo no modifica la reserva ni el listado', async () => {
  Object.assign(plan, { price: '300000.00', hours: 2, extraHourPrice: '50000.00' });
  expect((await getHallBooking(7)).plan).toMatchObject({ price: 150000, hours: 4 });
  expect((await listHallBookings()).items[0].extraHoursCost).toBe(10000);
  const result = await updateHallBooking(7, { extraHours: 1 });
  expect(result.pricing).toMatchObject({ price: 160000, previousDepositAmount: 48000, depositDifference: 0 });
});

test('seleccionar expresamente otro plan actualiza las condiciones contratadas', async () => {
  const next = { ...plan, planId: 2, price: '250000.00' };
  models.EventHallPricingPlan.findAll.mockResolvedValue([plan, next]);
  await updateHallBooking(7, { planId: 2 });
  expect(JSON.parse(entries.at(-1).details).plan).toMatchObject({ planId: 2, price: 250000 });
});

test('un registro financiero corrupto se informa y no se reemplaza por el precio actual', async () => {
  entries[0].details = '{roto';
  await expect(getHallBooking(7)).rejects.toThrow();
});
