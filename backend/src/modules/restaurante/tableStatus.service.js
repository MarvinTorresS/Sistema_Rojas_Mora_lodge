'use strict';

const { Op } = require('sequelize');
const { RestaurantTable, Resource, RestaurantAccount, Booking, ResourceBlock, sequelize } = require('../../models');
const { ACTIVE_BOOKING_STATUSES } = require('../../utils/bookingOverlap.util');

// HU-023: consulta operativa sin modificar el estado almacenado de las mesas.
async function listTableStatuses({ now = new Date() } = {}) {
  return sequelize.transaction(async (transaction) => {
    const tables = await RestaurantTable.findAll({
      include: [{ model: Resource, as: 'resource', required: true, where: { resourceType: 'restaurant_table' }, attributes: ['resourceId', 'status'] }],
      order: [['tableNumber', 'ASC']], transaction,
    });
    const resourceIds = tables.map((table) => table.resourceId);
    const tableIds = tables.map((table) => table.tableId);
    const currentInterval = { startDatetime: { [Op.lte]: now }, endDatetime: { [Op.gt]: now } };
    const [accounts, bookings, blocks] = tables.length ? await Promise.all([
      RestaurantAccount.findAll({ where: { tableId: { [Op.in]: tableIds }, status: 'open' }, attributes: ['tableId'], transaction }),
      Booking.findAll({ where: { resourceId: { [Op.in]: resourceIds }, status: { [Op.in]: ACTIVE_BOOKING_STATUSES }, ...currentInterval }, attributes: ['resourceId'], transaction }),
      ResourceBlock.findAll({ where: { resourceId: { [Op.in]: resourceIds }, isActive: true, ...currentInterval }, attributes: ['resourceId'], transaction }),
    ]) : [[], [], []];
    const occupied = new Set(accounts.map((account) => account.tableId));
    const reserved = new Set(bookings.map((booking) => booking.resourceId));
    const blocked = new Set(blocks.map((block) => block.resourceId));
    const items = tables.map((table) => {
      let status = 'available';
      if (table.status === 'inactive' || table.resource.status !== 'available' || blocked.has(table.resourceId)) status = 'unavailable';
      else if (table.status === 'occupied' || occupied.has(table.tableId)) status = 'occupied';
      else if (reserved.has(table.resourceId)) status = 'reserved';
      return { tableId: table.tableId, tableNumber: table.tableNumber, seatCount: table.seatCount, status, isInactive: table.status === 'inactive' };
    }).sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, 'es', { numeric: true }) || a.tableId - b.tableId);
    const counts = { available: 0, occupied: 0, reserved: 0, unavailable: 0 };
    for (const item of items) counts[item.status] += 1;
    return { items, counts, checkedAt: now.toISOString(), message: items.length && counts.available === 0 ? 'No hay mesas disponibles en este momento' : null };
  });
}

module.exports = { listTableStatuses };
