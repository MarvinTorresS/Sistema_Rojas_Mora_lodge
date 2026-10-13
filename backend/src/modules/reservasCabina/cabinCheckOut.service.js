'use strict';

const { Op } = require('sequelize');
const { Booking, Resource, RestaurantAccount, AccountItem, AuditLog, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');

async function checkOutCabin({ bookingId, userId = null, now = new Date() }) {
  return sequelize.transaction(async (transaction) => {
    const booking = await Booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw new DomainError('La reserva indicada no existe.', 404);
    const cabin = await Resource.findOne({
      where: { resourceId: booking.resourceId, resourceType: 'cabin' },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!cabin) throw new DomainError('La reserva no pertenece a una cabina.', 404);
    if (booking.status === 'completed') {
      throw new DomainError('El check-out de esta reserva ya fue registrado', 409);
    }
    if (booking.status !== 'checked_in') {
      throw new DomainError('Solo se puede registrar la salida de una estadía en curso.', 409);
    }
    const accounts = await RestaurantAccount.findAll({
      where: { bookingId: booking.bookingId, status: { [Op.ne]: 'cancelled' } },
      attributes: ['accountId'], transaction, lock: transaction.LOCK.UPDATE,
    });
    // HU-040 aun no define una relacion verificable entre cada consumo y su
    // factura. Hasta integrar ese contrato, no suponer que una factura cualquiera
    // cubre los consumos: bloquear los no retirados de cuentas no canceladas.
    const consumption = accounts.length ? await AccountItem.findOne({
      where: { accountId: { [Op.in]: accounts.map((account) => account.accountId) }, isRemoved: false },
      attributes: ['itemId'], transaction, lock: transaction.LOCK.UPDATE,
    }) : null;
    if (consumption) {
      throw new DomainError('Existen consumos pendientes de facturar', 409, { code: 'UNVERIFIED_RESTAURANT_BILLING' });
    }
    await booking.update({ status: 'completed' }, { transaction });
    await AuditLog.create({
      userId, action: 'cabin_check_out', entityType: 'booking', entityId: booking.bookingId,
      details: JSON.stringify({ previousStatus: 'checked_in', newStatus: 'completed', actualCheckOut: now.toISOString(), resourceId: cabin.resourceId }),
    }, { transaction });
    return { bookingId: booking.bookingId, status: 'completed', actualCheckOut: now.toISOString() };
  });
}

module.exports = { checkOutCabin };
