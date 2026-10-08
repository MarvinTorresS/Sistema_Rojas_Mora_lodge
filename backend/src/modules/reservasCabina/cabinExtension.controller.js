'use strict';

// Traductor HTTP <-> service de la extension de hospedaje (HU-127). Igual
// de "tonto" que reservasCabina.controller.js: no valida forma ni decide
// reglas de negocio; los DomainError del service se entregan tal cual al
// errorHandler global con next(error).
const cabinExtensionService = require('./cabinExtension.service');

// GET /api/cabin-bookings/extendable — reservas entre las que elegir.
async function listExtendable(req, res, next) {
  try {
    const result = await cabinExtensionService.listExtendableBookings({
      search: req.query.search,
    });
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
}

// GET /api/cabin-bookings/:bookingId/extension-quote — cotizacion previa
// (solo lectura): monto de la extension, nuevo total y si hay cupo.
async function getQuote(req, res, next) {
  try {
    const result = await cabinExtensionService.quoteCabinExtension({
      bookingId: Number(req.params.bookingId),
      newCheckOutDate: req.query.newCheckOutDate,
    });
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
}

// POST /api/cabin-bookings/:bookingId/extensions — confirmar (CA-1).
async function createExtension(req, res, next) {
  try {
    const result = await cabinExtensionService.extendCabinStay({
      bookingId: Number(req.params.bookingId),
      newCheckOutDate: req.body.newCheckOutDate,
    });
    return res.status(201).json({ data: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listExtendable,
  getQuote,
  createExtension,
};
