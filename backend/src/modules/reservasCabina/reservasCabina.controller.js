'use strict';

// Traductor HTTP <-> service, igual de "tonto" que el de cancha y salon:
// no valida forma (ya lo hizo el validator) ni decide reglas de negocio
// (eso es del service). Solo pasa los datos hacia adentro y el
// resultado hacia afuera.
const reservasCabinaService = require('./reservasCabina.service');

// GET /api/cabin-bookings/availability — disponibilidad de todas las
// cabinas para la pantalla de registro (HU-016, CA-2).
async function getAvailability(req, res, next) {
  try {
    const result = await reservasCabinaService.getCabinAvailability({
      checkInDate: req.query.checkInDate,
      checkOutDate: req.query.checkOutDate,
      partySize: req.query.partySize,
      agendaFrom: req.query.agendaFrom,
      agendaTo: req.query.agendaTo,
    });
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
}

// POST /api/cabin-bookings — HU-016.
async function createBooking(req, res, next) {
  try {
    const result = await reservasCabinaService.createCabinBooking(req.body);
    return res.status(201).json({ data: result });
  } catch (error) {
    // DomainError ya trae su statusCode (y opcionalmente code/details);
    // el errorHandler global arma la respuesta. Cualquier otro error
    // sigue el mismo camino y termina como 500.
    return next(error);
  }
}

module.exports = {
  getAvailability,
  createBooking,
};
