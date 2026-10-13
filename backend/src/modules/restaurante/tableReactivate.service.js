'use strict';
const { Op } = require('sequelize');
const { RestaurantTable, Resource, RestaurantAccount, Booking, ResourceBlock, AuditLog, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { ACTIVE_BOOKING_STATUSES } = require('../../utils/bookingOverlap.util');

async function reactivateTable({ tableId, userId = null, now = new Date() }) {
  return sequelize.transaction(async (transaction) => {
    const table = await RestaurantTable.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!table) throw new DomainError('La mesa indicada no existe.', 404);
    if (table.status !== 'inactive') throw new DomainError('La mesa ya se encuentra activa', 409);
    const resource = await Resource.findOne({ where: { resourceId: table.resourceId, resourceType: 'restaurant_table' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!resource) throw new DomainError('El recurso de la mesa no existe.', 404);
    if (resource.status !== 'available') throw new DomainError('La mesa no puede reactivarse mientras su recurso está fuera de servicio.', 409);
    const currentInterval = { startDatetime: { [Op.lte]: now }, endDatetime: { [Op.gt]: now } };
    if (await RestaurantAccount.count({ where: { tableId: table.tableId, status: 'open' }, transaction })) {
      throw new DomainError('La mesa tiene una cuenta abierta y no puede reactivarse como disponible.', 409);
    }
    if (await Booking.count({ where: { resourceId: table.resourceId, status: { [Op.in]: ACTIVE_BOOKING_STATUSES }, ...currentInterval }, transaction })) {
      throw new DomainError('La mesa tiene una reserva vigente y no puede reactivarse como disponible.', 409);
    }
    if (await ResourceBlock.count({ where: { resourceId: table.resourceId, isActive: true, ...currentInterval }, transaction })) {
      throw new DomainError('La mesa tiene un bloqueo vigente y no puede reactivarse.', 409);
    }
    await table.update({ status: 'available' }, { transaction });
    await AuditLog.create({ userId, action: 'restaurant_table_reactivated', entityType: 'restaurant_table', entityId: table.tableId,
      details: JSON.stringify({ previousStatus: 'inactive', newStatus: 'available', resourceId: table.resourceId }) }, { transaction });
    return { tableId: table.tableId, status: 'available', message: 'Mesa reactivada exitosamente.' };
  });
}
module.exports = { reactivateTable };
