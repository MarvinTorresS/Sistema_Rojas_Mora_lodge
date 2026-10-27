'use strict';

// Traductor HTTP <-> service de la busqueda de reservas por huesped
// (HU-018). Igual de "tonto" que los otros controllers del modulo.
const cabinSearchService = require('./cabinSearch.service');

// GET /api/cabin-bookings/search?q=&page=&pageSize=
async function searchBookings(req, res, next) {
  try {
    const { items, ...meta } = await cabinSearchService.searchCabinBookings({
      q: req.query.q,
      page: req.query.page,
      pageSize: req.query.pageSize,
      operation: req.query.operation,
    });
    return res.json({ data: items, meta });
  } catch (error) {
    return next(error);
  }
}

module.exports = { searchBookings };
