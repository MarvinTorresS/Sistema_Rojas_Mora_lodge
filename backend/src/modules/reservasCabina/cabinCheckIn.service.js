'use strict';

const { Booking, Resource, AuditLog, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { toHotelDate } = require('./cabinStay.util');

async function checkInCabin({ bookingId, userId = null, now = new Date() }) {
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
    if (arrival > today) {
      // La excepcion administrativa necesita identidad y permisos reales (Sprint 5).
      throw new DomainError('No es posible realizar el check-in antes de la fecha de entrada', 422);
    }
    if (arrival !== today) {
      throw new DomainError('La fecha de entrada de la reserva debe ser la fecha actual.', 422);
    }
    if (cabin.status !== 'available') {
      throw new DomainError('La cabina no está disponible para registrar el ingreso.', 409);
    }
    const occupant = await Booking.findOne({
      where: { resourceId: cabin.resourceId, status: 'checked_in' }, transaction,
    });
    if (occupant) throw new DomainError('La cabina tiene otro huésped con una estadía en curso.', 409);
    await booking.update({ status: 'checked_in' }, { transaction });
    await AuditLog.create({
      userId, action: 'cabin_check_in', entityType: 'booking', entityId: booking.bookingId,
      details: JSON.stringify({ previousStatus: 'active', newStatus: 'checked_in', actualCheckIn: now.toISOString(), resourceId: cabin.resourceId }),
    }, { transaction });
    return { bookingId: booking.bookingId, status: 'checked_in', actualCheckIn: now.toISOString() };
  });
}

module.exports = { checkInCabin };
