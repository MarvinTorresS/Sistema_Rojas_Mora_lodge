'use strict';

// Traductor HTTP <-> service de la modificacion de reservas de cabina
// (HU-019). Igual de "tonto" que los otros controllers del modulo: no
// valida ni decide reglas; los DomainError del service van al errorHandler.
const cabinBookingUpdateService = require('./cabinBookingUpdate.service');

// PATCH /api/cabin-bookings/:bookingId — modificar fechas, cabina o datos
// del huesped. 200: se modifica un recurso existente.
async function updateBooking(req, res, next) {
  try {
    const data = await cabinBookingUpdateService.updateCabinBooking({
      bookingId: Number(req.params.bookingId),
      changes: req.body,
    });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { updateBooking };
