'use strict';
const { readCabinBookings } = require('./cabinBookingRead.service');

async function listCabinBookings(params) {
  const result = await readCabinBookings(params);
  return {
    ...result,
    message: result.total === 0 ? 'No hay reservas de cabinas registradas' : null,
  };
}
module.exports = { listCabinBookings };
