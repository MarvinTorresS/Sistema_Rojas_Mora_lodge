'use strict';

const { Op } = require('sequelize');
const { Booking, Resource, RestaurantAccount, AccountItem, Invoice, InvoiceLine, AuditLog, sequelize } = require('../../models');
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
    const consumptions = accounts.length ? await AccountItem.findAll({
      where: { accountId: { [Op.in]: accounts.map((account) => account.accountId) }, isRemoved: false },
      attributes: ['itemId', 'quantity', 'unitPrice'], transaction, lock: transaction.LOCK.UPDATE,
    }) : [];
    if (consumptions.length) {
      const invoices = await Invoice.findAll({
        where: { bookingId: booking.bookingId, customerId: booking.customerId, status: { [Op.in]: ['pending', 'paid'] }, issuedAt: { [Op.ne]: null } },
        attributes: ['invoiceId'], transaction, lock: transaction.LOCK.UPDATE,
      });
      // Contrato de integracion HU-040: cada linea restaurant referencia
      // AccountItem.itemId, con su importe completo. No basta una factura de
      // la reserva ni una cuenta marcada como cerrada.
      const lines = invoices.length ? await InvoiceLine.findAll({
        where: { invoiceId: { [Op.in]: invoices.map((invoice) => invoice.invoiceId) }, sourceType: 'restaurant', sourceId: { [Op.in]: consumptions.map((item) => item.itemId) } },
        attributes: ['sourceId', 'amount'], transaction, lock: transaction.LOCK.UPDATE,
      }) : [];
      const uncovered = consumptions.some((item) => !lines.some((line) => Number(line.sourceId) === Number(item.itemId) && Math.round(Number(line.amount) * 100) === Math.round(Number(item.unitPrice) * 100) * Number(item.quantity)));
      if (uncovered) throw new DomainError('Existen consumos pendientes de facturar', 409, { code: 'UNVERIFIED_RESTAURANT_BILLING' });
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
