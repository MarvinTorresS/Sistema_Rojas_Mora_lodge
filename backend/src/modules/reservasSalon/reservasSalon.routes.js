'use strict';

// Router de RESERVAS del salon de eventos (HU-007, HU-013, HU-014,
// HU-015). El CRUD de planes de precio (HU-008 a HU-012) es una
// entidad distinta -- va en un archivo hermano, eventHallPlans.routes.js,
// montado bajo su propio prefijo (/api/event-hall-plans) por quien
// tenga esas HU este sprint (ver comentario en app.js).
//
// HU-007, HU-013, HU-014 y HU-015 implementadas. Mantener las rutas
// estaticas antes de /:bookingId.
const express = require('express');
const controller = require('./reservasSalon.controller');
const { checkAvailabilityRules, createHallBookingRules, bookingIdRules, listHallBookingsRules, updateHallBookingRules, cancelHallBookingRules } = require('./reservasSalon.validator');

const router = express.Router();

// HU-007 (Marvin) — Consultar disponibilidad del salon para una fecha
// y horario. Query string: ?resourceId=&startDatetime=&endDatetime=
// (ISO 8601).
router.get('/availability', checkAvailabilityRules, controller.checkAvailability);

// HU-013 (Marvin) — Registrar la reserva del salon con el plan de
// precios seleccionado.
router.post('/', createHallBookingRules, controller.createBooking);

// HU-014 (Kendall) — Modificar una reserva existente del salon de
// eventos: consulta y edicion de plan, fecha y horario.
router.get('/', listHallBookingsRules, controller.listBookings);
router.get('/:bookingId', bookingIdRules, controller.getBooking);
router.patch('/:bookingId', updateHallBookingRules, controller.updateBooking);

// HU-015 (Kendall) — Cancelar una reserva existente del salon de
// eventos.
router.post('/:bookingId/cancel', cancelHallBookingRules, controller.cancelBooking);

module.exports = router;
