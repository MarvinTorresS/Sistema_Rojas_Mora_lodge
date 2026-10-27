'use strict';

const { literal } = require('sequelize');
const { todayInHotelTimeZone, addDays, toHotelDatetime } = require('./cabinStay.util');

// Solo las pantallas de ingreso/salida solicitan este orden. Ordenar antes
// de paginar evita que una reserva operable quede en otra pagina del historial.
function cabinOperationOrder(operation) {
  if (!['check-in', 'check-out'].includes(operation)) return undefined;
  let priority;
  if (operation === 'check-in') {
    const today = todayInHotelTimeZone();
    // Valores generados por Date; nunca interpolar parametros del cliente.
    const sqlDate = (date) => `'${date.toISOString().slice(0, 19).replace('T', ' ')}'`;
    const start = sqlDate(toHotelDatetime(today, '00:00:00'));
    const end = sqlDate(toHotelDatetime(addDays(today, 1), '00:00:00'));
    priority = `CASE WHEN \`Booking\`.\`status\` = 'active' AND \`Booking\`.\`start_datetime\` >= ${start} AND \`Booking\`.\`start_datetime\` < ${end} THEN 0 WHEN \`Booking\`.\`status\` = 'active' AND \`Booking\`.\`start_datetime\` >= ${end} THEN 1 WHEN \`Booking\`.\`status\` = 'checked_in' THEN 2 ELSE 3 END`;
  } else {
    priority = "CASE WHEN `Booking`.`status` = 'checked_in' THEN 0 WHEN `Booking`.`status` = 'active' THEN 1 ELSE 2 END";
  }
  return [[literal(priority), 'ASC'], ['startDatetime', 'ASC'], ['bookingId', 'ASC']];
}

module.exports = { cabinOperationOrder };
