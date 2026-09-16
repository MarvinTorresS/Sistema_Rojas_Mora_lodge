'use strict';

// Router de RESERVAS del salon de eventos (HU-007, HU-013, HU-014,
// HU-015). El CRUD de planes de precio (HU-008 a HU-012) es una
// entidad distinta -- va en un archivo hermano, eventHallPlans.routes.js,
// montado bajo su propio prefijo (/api/event-hall-plans) por quien
// tenga esas HU este sprint (ver comentario en app.js).
//
// Misma convencion que reservasCancha.routes.js: las 4 rutas de este
// modulo se declaran desde el inicio, aunque solo HU-007 y HU-013
// tienen logica implementada, para que este archivo compartido quede
// estable. Cuando a Kendall le toque HU-014/HU-015, reemplaza
// UNICAMENTE su propia linea de router.<verbo>(...).
const express = require('express');
const controller = require('./reservasSalon.controller');
const { checkAvailabilityRules, createHallBookingRules } = require('./reservasSalon.validator');

const router = express.Router();

// HU-007 (Marvin) — Consultar disponibilidad del salon para una fecha
// y horario. Query string: ?resourceId=&startDatetime=&endDatetime=
// (ISO 8601).
router.get('/availability', checkAvailabilityRules, controller.checkAvailability);

// HU-013 (Marvin) — Registrar la reserva del salon con el plan de
// precios seleccionado.
router.post('/', createHallBookingRules, controller.createBooking);

// HU-014 (Kendall) — Modificar una reserva existente del salon de
// eventos (fecha, horario o plan).
// TODO (Kendall, Sprint 2): PATCH /:bookingId

// HU-015 (Kendall) — Cancelar una reserva existente del salon de
// eventos.
// TODO (Kendall, Sprint 2): POST /:bookingId/cancel

module.exports = router;
