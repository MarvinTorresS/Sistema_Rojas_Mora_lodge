'use strict';

const { Op } = require('sequelize');
const { Booking, Resource, ResourceBlock, AuditLog, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { toHotelDate } = require('./cabinStay.util');
const { buildEarlyQuote } = require('./cabinEarlyQuote.service');

async function checkInCabin({ bookingId, userId = null, now = new Date(), approval = null }) {
  return sequelize.transaction(async (transaction) => {
    const booking = await Booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw new DomainError('La reserva indicada no existe.', 404);
    const cabin = await Resource.findOne({
      where: { resourceId: booking.resourceId, resourceType: 'cabin' },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!cabin) throw new DomainError('La reserva no pertenece a una cabina.', 404);
    if (booking.status === 'checked_in') {
      throw new DomainError('El check-in de esta reserva ya fue registrado', 409);
    }
    if (booking.status !== 'active') {
      throw new DomainError('Solo se puede registrar el ingreso de una reserva activa.', 409);
    }
    const arrival = toHotelDate(booking.startDatetime);
    const today = toHotelDate(now);
    const early = arrival > today;
    if (early && (!approval || approval.userId !== userId || !approval.reason)) {
      throw new DomainError('No es posible realizar el check-in antes de la fecha de entrada', 422);
    }
    if (arrival < today) {
      throw new DomainError('La fecha de entrada de la reserva debe ser la fecha actual.', 422);
    }
    if (cabin.status !== 'available') {
      throw new DomainError('La cabina no está disponible para registrar el ingreso.', 409);
    }
    const occupant = await Booking.findOne({
      where: { resourceId: cabin.resourceId, status: 'checked_in' }, transaction,
    });
    if (occupant) throw new DomainError('La cabina tiene otro huésped con una estadía en curso.', 409);
    let quote = null;
    const scheduledArrival = booking.startDatetime;
    if (early) {
      const range = { resourceId: cabin.resourceId, startDatetime: { [Op.lt]: booking.endDatetime }, endDatetime: { [Op.gt]: now } };
      const conflict = await Booking.findOne({ where: { ...range, bookingId: { [Op.ne]: booking.bookingId }, status: { [Op.in]: ['pending', 'active', 'checked_in'] } }, transaction });
      const block = await ResourceBlock.findOne({ where: { ...range, isActive: true }, transaction });
      if (conflict || block) throw new DomainError('La cabina no está disponible durante el ingreso anticipado.', 409);
      quote = await buildEarlyQuote(booking, now, transaction);
      if (approval.feeMode === 'waive') quote = { ...quote, waivedAmount: quote.additionalAmount, additionalAmount: 0, totalAmount: quote.previousTotal };
      quote.feeMode = approval.feeMode ?? 'charge';
      if (typeof approval.expectedAdditionalAmount !== 'number' || approval.expectedAdditionalAmount !== quote.additionalAmount) throw new DomainError('El recargo cambió o no fue confirmado. Consultá nuevamente el importe antes de autorizar.', 409);
    }
    await booking.update({ status: 'checked_in', ...(early ? { startDatetime: now } : {}) }, { transaction });
    if (early) await AuditLog.create({ userId, action: 'cabin_booking_updated', entityType: 'booking', entityId: booking.bookingId, details: JSON.stringify({ ...quote, reason: approval.reason, originalStartDatetime: scheduledArrival, actualCheckIn: now.toISOString() }) }, { transaction });
    await AuditLog.create({
      userId, action: 'cabin_check_in', entityType: 'booking', entityId: booking.bookingId,
      details: JSON.stringify({ previousStatus: 'active', newStatus: 'checked_in', actualCheckIn: now.toISOString(), resourceId: cabin.resourceId, ...(early ? { earlyAuthorization: { userId: approval.userId, reason: approval.reason }, scheduledArrival } : {}) }),
    }, { transaction });
    return { bookingId: booking.bookingId, status: 'checked_in', actualCheckIn: now.toISOString(), ...(quote ? { stay: { checkInDate: quote.checkInDate, checkOutDate: quote.checkOutDate }, totalAmount: quote.totalAmount } : {}) };
  });
}

module.exports = { checkInCabin };
