'use strict';
const { Booking, Resource, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');

// Cancelar no modifica importes, auditorías de precios ni el estado operativo.
async function cancelCabinBooking({ bookingId }) {
  const initial = await Booking.findByPk(bookingId, { attributes: ['bookingId', 'resourceId'] });
  if (!initial) throw new DomainError('La reserva indicada no existe.', 404);
  const resourceId = initial.resourceId;
  return sequelize.transaction(async (transaction) => {
    // Mismo orden que edición y extensión: Resource -> Booking.
    const resource = await Resource.findOne({
      where: { resourceId, resourceType: 'cabin' }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!resource) throw new DomainError('La reserva indicada no corresponde a una cabina.', 404);
    const booking = await Booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw new DomainError('La reserva indicada no existe.', 404);
    if (booking.resourceId !== resourceId) {
      throw new DomainError('La reserva cambió de cabina mientras se procesaba. Intente de nuevo.', 409, { code: 'BOOKING_CHANGED' });
    }
    if (booking.status === 'checked_in') {
      throw new DomainError('No se puede cancelar la reserva porque el huésped ya ingresó.', 409, { code: 'GUEST_ALREADY_CHECKED_IN' });
    }
    if (!['pending', 'active'].includes(booking.status)) {
      throw new DomainError(booking.status === 'cancelled' ? 'La reserva ya está cancelada.' : 'El estado de la reserva no permite cancelarla.', 409, { code: 'BOOKING_NOT_CANCELLABLE' });
    }
    await booking.update({ status: 'cancelled' }, { transaction });
    return { booking: { bookingId: booking.bookingId, status: booking.status } };
  });
}
module.exports = { cancelCabinBooking };
