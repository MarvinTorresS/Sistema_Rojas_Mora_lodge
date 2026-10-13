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

async function listBookings(req, res, next) {
  try {
    const { items, ...meta } = await reservasSalonService.listHallBookings(req.query);
    return res.json({ data: items, meta });
  } catch (error) { return next(error); }
}

async function getBooking(req, res, next) {
  try {
    return res.json({ data: await reservasSalonService.getHallBooking(req.params.bookingId) });
  } catch (error) { return next(error); }
}

async function updateBooking(req, res, next) {
  try {
    return res.json({ data: await reservasSalonService.updateHallBooking(req.params.bookingId, req.body) });
  } catch (error) { return next(error); }
}

async function cancelBooking(req, res, next) {
  try {
    return res.json({ data: await reservasSalonService.cancelHallBooking(req.params.bookingId, req.body) });
  } catch (error) { return next(error); }
}

module.exports = {
  cancelBooking,
  listBookings,
  getBooking,
  updateBooking,
  checkAvailability,
  createBooking,
};
