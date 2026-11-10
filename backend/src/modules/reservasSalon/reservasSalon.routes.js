'use strict';

// Router de RESERVAS del salon de eventos (HU-007, HU-013, HU-014,
// HU-015). El salon se reserva por dia (entrada y salida fijas); ya no
// existe el catalogo de planes de precio.
//
// HU-007, HU-013, HU-014 y HU-015 implementadas. Mantener las rutas
// estaticas antes de /:bookingId.
const express = require('express');
const controller = require('./reservasSalon.controller');
const { checkAvailabilityRules, createHallBookingRules, bookingIdRules, listHallBookingsRules, updateHallBookingRules, cancelHallBookingRules } = require('./reservasSalon.validator');

const router = express.Router();

// Horario fijo de entrada y salida del salon.
router.get('/schedule', controller.getSchedule);

// HU-007 (Marvin) — Consultar disponibilidad del salon para un dia.
// Query string: ?resourceId=&date=yyyy-mm-dd
router.get('/availability', checkAvailabilityRules, controller.checkAvailability);

// HU-013 (Marvin) — Registrar la reserva del salon para un dia.
router.post('/', createHallBookingRules, controller.createBooking);

// HU-014 (Kendall) — Modificar una reserva existente del salon de
// eventos: consulta y cambio de dia.
router.get('/', listHallBookingsRules, controller.listBookings);
router.get('/:bookingId', bookingIdRules, controller.getBooking);
router.patch('/:bookingId', updateHallBookingRules, controller.updateBooking);

// HU-015 (Kendall) — Cancelar una reserva existente del salon de
// eventos.
router.post('/:bookingId/cancel', cancelHallBookingRules, controller.cancelBooking);

module.exports = router;
