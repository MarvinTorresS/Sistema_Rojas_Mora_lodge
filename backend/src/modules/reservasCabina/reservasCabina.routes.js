'use strict';

// Router de RESERVAS de cabinas (Sprint 3: HU-016 a HU-022 y HU-127).
//
// Misma convencion que reservasCancha.routes.js y reservasSalon.routes.js:
// las rutas de TODO el sprint se declaran desde el inicio, aunque solo
// HU-016 tenga logica, para que este archivo compartido quede estable.
// Cuando a cada quien le toque su HU, reemplaza UNICAMENTE su propia
// linea de router.<verbo>(...) y no toca las de los demas (evita
// conflictos de Git).
const express = require('express');
const controller = require('./reservasCabina.controller');
const { cabinAvailabilityRules, createCabinBookingRules } = require('./reservasCabina.validator');
const extensionController = require('./cabinExtension.controller');
const {
  extendCabinStayRules, quoteCabinExtensionRules, listExtendableRules,
} = require('./cabinExtension.validator');

const router = express.Router();

// HU-016 (Marvin) — Disponibilidad de todas las cabinas para unas
// fechas y un grupo. Va ANTES de las rutas con :bookingId para que
// Express no interprete "availability" como un id.
// Query: ?checkInDate=&checkOutDate=&partySize=&agendaFrom=&agendaTo=
router.get('/availability', cabinAvailabilityRules, controller.getAvailability);

// HU-127 (Marvin) — Reservas entre las que elegir la que se va a extender
// (?search= nombre o identificacion). Tambien va ANTES de las rutas con
// :bookingId, por la misma razon que /availability.
router.get('/extendable', listExtendableRules, extensionController.listExtendable);

// HU-016 (Marvin) — Registrar una reserva de cabina con los datos del
// huesped.
router.post('/', createCabinBookingRules, controller.createBooking);

// HU-017 (Kendall) — Consultar el listado de reservas de cabinas.
// TODO (Kendall, Sprint 3): GET /

// HU-018 (Alison) — Buscar una reserva de cabina por huesped.
// TODO (Alison, Sprint 3): GET /search

// HU-019 (Alison) — Modificar una reserva de cabina existente.
// TODO (Alison, Sprint 3): PATCH /:bookingId

// HU-020 (Kendall) — Cancelar una reserva de cabina existente.
// TODO (Kendall, Sprint 3): POST /:bookingId/cancel

// HU-021 (Wagner) — Registrar el ingreso (check-in) del huesped.
// TODO (Wagner, Sprint 3): POST /:bookingId/check-in

// HU-022 (Wagner) — Registrar la salida (check-out) del huesped.
// TODO (Wagner, Sprint 3): POST /:bookingId/check-out

// HU-127 (Marvin) — Gestionar la solicitud de extension de hospedaje.
// Sus tres endpoints viven en cabinExtension.* (un archivo por capa) para
// no mezclar esta HU con el resto del modulo.
router.get('/:bookingId/extension-quote', quoteCabinExtensionRules, extensionController.getQuote);
router.post('/:bookingId/extensions', extendCabinStayRules, extensionController.createExtension);

module.exports = router;
