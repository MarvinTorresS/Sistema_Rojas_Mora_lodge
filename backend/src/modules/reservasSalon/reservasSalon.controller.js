'use strict';

// Traductor HTTP <-> service, igual de "tonto" que
// reservasCancha.controller.js: no valida forma (ya lo hizo el
// validator) ni decide reglas de negocio (eso es el service).
const reservasSalonService = require('./reservasSalon.service');

// GET /api/hall-bookings/availability — HU-007.
async function checkAvailability(req, res, next) {
  try {
    const result = await reservasSalonService.checkHallAvailability({
      resourceId: req.query.resourceId,
      startDatetime: req.query.startDatetime,
      endDatetime: req.query.endDatetime,
    });
    return res.json({ data: result });
  } catch (error) {
    // DomainError ya trae su propio statusCode; cualquier otro error
    // sigue hacia el errorHandler global (500).
    return next(error);
  }
}

// POST /api/hall-bookings — HU-013.
async function createBooking(req, res, next) {
  try {
    const result = await reservasSalonService.createHallBooking(req.body);
    return res.status(201).json({ data: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  checkAvailability,
  createBooking,
};
