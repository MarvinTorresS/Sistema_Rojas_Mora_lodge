'use strict';
jest.mock('../../src/models', () => ({
  Booking: { findByPk: jest.fn(), findAll: jest.fn() },
  Resource: { findOne: jest.fn(), findAll: jest.fn() },
  ResourceBlock: { findAll: jest.fn() }, CabinDetail: { findByPk: jest.fn() }, Customer: {},
  sequelize: { transaction: jest.fn() },
}));
const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../../src/app');
const { Booking, Resource, ResourceBlock, CabinDetail, sequelize } = require('../../src/models');
const { cancelCabinBooking } = require('../../src/modules/reservasCabina/cabinCancellation.service');
const { getCabinAvailability } = require('../../src/modules/reservasCabina/reservasCabina.service');
const { updateCabinBooking } = require('../../src/modules/reservasCabina/cabinBookingUpdate.service');
const { extendCabinStay } = require('../../src/modules/reservasCabina/cabinExtension.service');
let booking; let transaction; let resource;
const commit = jest.fn(); const rollback = jest.fn();
beforeEach(() => {
  jest.resetAllMocks();
  transaction = { LOCK: { UPDATE: 'UPDATE' } };
  booking = { bookingId: 5, resourceId: 3, customerId: 7, status: 'active', originChannel: 'web',
    startDatetime: new Date('2027-01-10T21:00:00Z'), endDatetime: new Date('2027-01-12T17:00:00Z'),
    cancellationReason: null,
  };
  booking.update = jest.fn(async (values) => Object.assign(booking, values));
  resource = { resourceId: 3, status: 'available', name: 'Cabina 1', cabinDetail: { capacity: 4, pricePerNight: 35000 } };
  Booking.findByPk.mockImplementation(async () => booking);
  Resource.findOne.mockResolvedValue(resource);
  CabinDetail.findByPk.mockResolvedValue(resource.cabinDetail);
  Resource.findAll.mockResolvedValue([resource]);
  ResourceBlock.findAll.mockResolvedValue([]);
  Booking.findAll.mockImplementation(async ({ where }) =>
    where.status[Op.in].includes(booking.status) ? [booking] : []);
  // Simula el contrato de transacción administrada y la restauración al fallar.
  sequelize.transaction.mockImplementation(async (callback) => {
    const snapshot = { ...booking };
    try { const result = await callback(transaction); commit(); return result; }
    catch (error) { Object.assign(booking, snapshot); rollback(); throw error; }
  });
});
const cancel = () => request(app).post('/api/cabin-bookings/5/cancel');

describe('HU-020 cancelación', () => {
  it.each(['active', 'pending'])('cancela %s conservando todos los demás datos', async (status) => {
    booking.status = status;
    const original = { ...booking };
    const result = await cancel().expect(200);
    expect(result.body.data.booking).toEqual({ bookingId: 5, status: 'cancelled' });
    expect(booking).toEqual({ ...original, status: 'cancelled' });
    expect(booking.update).toHaveBeenCalledWith({ status: 'cancelled' }, { transaction });
    expect(resource.status).toBe('available');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    expect(Resource.findOne).toHaveBeenCalledWith({ where: { resourceId: 3, resourceType: 'cabin' }, transaction, lock: 'UPDATE' });
    expect(Booking.findByPk).toHaveBeenLastCalledWith(5, { transaction, lock: 'UPDATE' });
    expect(Resource.findOne.mock.invocationCallOrder[0]).toBeLessThan(Booking.findByPk.mock.invocationCallOrder[1]);
  });
  it('404 si no existe', async () => {
    Booking.findByPk.mockResolvedValue(null);
    await cancel().expect(404);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
  it.each(['field', 'event_hall'])('404 para recurso %s', async () => {
    Resource.findOne.mockResolvedValue(null);
    await cancel().expect(404);
    expect(booking.update).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });
  it.each(['checked_in', 'cancelled', 'completed', 'rejected'])('409 sin escritura para %s', async (status) => {
    booking.status = status;
    const response = await cancel().expect(409);
    if (status === 'checked_in') expect(response.body.error.code).toBe('GUEST_ALREADY_CHECKED_IN');
    expect(booking.status).toBe(status);
    expect(booking.update).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });
  it('una segunda cancelación no repite efectos', async () => {
    await cancel().expect(200);
    await cancel().expect(409);
    expect(booking.update).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  it('relee el estado después del bloqueo: ingreso concurrente', async () => {
    Booking.findByPk.mockResolvedValueOnce({ resourceId: 3 });
    Resource.findOne.mockImplementation(async () => { booking.status = 'checked_in'; return resource; });
    await cancel().expect(409);
    expect(booking.update).not.toHaveBeenCalled();
  });
  it('rechaza cambio de cabina concurrente', async () => {
    Booking.findByPk.mockResolvedValueOnce({ resourceId: 4 });
    const response = await cancel().expect(409);
    expect(response.body.error.code).toBe('BOOKING_CHANGED');
    expect(booking.update).not.toHaveBeenCalled();
  });
  it('404 si desaparece al releer y revierte la transacción', async () => {
    Booking.findByPk.mockResolvedValueOnce({ resourceId: 3 }).mockResolvedValueOnce(null);
    await cancel().expect(404);
    expect(rollback).toHaveBeenCalledTimes(1);
  });
  it('propaga fallo de escritura y provoca rollback sin cambio parcial', async () => {
    booking.update.mockImplementation(async () => { booking.status = 'cancelled'; throw new Error('Fallo de escritura'); });
    await expect(cancelCabinBooking({ bookingId: 5 })).rejects.toThrow('Fallo de escritura');
    expect(booking.status).toBe('active');
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', 'abc', '1.5', '2147483648'])('422 para identificador %s', async (id) => {
    await request(app).post(`/api/cabin-bookings/${id}/cancel`).expect(422);
    expect(Booking.findByPk).not.toHaveBeenCalled();
  });
  const availability = () => getCabinAvailability({ checkInDate: '2027-01-10', checkOutDate: '2027-01-12', partySize: 2 });
  it('libera el intervalo en disponibilidad sin cambiar el recurso', async () => {
    expect((await availability()).cabins[0].availability).toBe('occupied');
    await cancel().expect(200);
    expect((await availability()).cabins[0].availability).toBe('available');
    expect((await availability()).cabins[0].nights.every((night) => !night.occupied)).toBe(true);
  });
  it.each(['reserva', 'bloqueo'])('conserva la ocupación de otra %s', async (source) => {
    const other = { ...booking, bookingId: 6 };
    await cancel().expect(200);
    if (source === 'reserva') Booking.findAll.mockResolvedValue([other]);
    else ResourceBlock.findAll.mockResolvedValue([other]);
    expect((await availability()).cabins[0].availability).toBe('occupied');
    expect(other.status).toBe('active');
  });
  it('mantiene fuera de servicio una cabina en mantenimiento', async () => {
    resource.status = 'maintenance';
    await cancel().expect(200);
    expect((await availability()).cabins[0].availability).toBe('out_of_service');
  });
  it('edición y extensión rechazan la reserva cancelada', async () => {
    await cancel().expect(200);
    await expect(updateCabinBooking({ bookingId: 5, changes: {} })).rejects.toMatchObject({ statusCode: 422 });
    await expect(extendCabinStay({ bookingId: 5, newCheckOutDate: '2027-01-13' })).rejects.toMatchObject({ statusCode: 422 });
    expect(booking.update).toHaveBeenCalledTimes(1);
  });
});
