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

// HU-018 y HU-019: buscar por huesped y modificar una reserva.
const searchController = require('./cabinSearch.controller');
const { searchCabinBookingsRules } = require('./cabinSearch.validator');
const updateController = require('./cabinBookingUpdate.controller');
const { updateCabinBookingRules } = require('./cabinBookingUpdate.validator');

const listController = require('./cabinList.controller');
const { listCabinBookingsRules } = require('./cabinList.validator');

const cancellationController = require('./cabinCancellation.controller');
const { cancelCabinBookingRules } = require('./cabinCancellation.validator');
const checkInController = require('./cabinCheckIn.controller');
const { checkInRules } = require('./cabinCheckIn.validator');
const checkOutController = require('./cabinCheckOut.controller');
const { checkOutRules } = require('./cabinCheckOut.validator');

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
router.get('/', listCabinBookingsRules, listController.listBookings);

// HU-018 — Buscar una reserva de cabina por huesped (nombre o
// identificacion, coincidencia parcial). Query: ?q=&page=&pageSize=
// Va ANTES de las rutas con :bookingId, por la misma razon que /availability.
router.get('/search', searchCabinBookingsRules, searchController.searchBookings);

// HU-019 — Modificar una reserva de cabina existente (fechas,
// cabina o datos del huesped). Body: cualquiera de resourceId, checkInDate,
// checkOutDate, companions, guestName, guestPhone, guestEmail.
router.patch('/:bookingId', updateCabinBookingRules, updateController.updateBooking);

// HU-020 (Kendall) — Cancelar una reserva de cabina existente.
router.post('/:bookingId/cancel', cancelCabinBookingRules, cancellationController.cancelBooking);

// HU-021 (Wagner) — Registrar el ingreso (check-in) del huesped.
router.post('/:bookingId/check-in', require('./cabinApprovalThrottle.middleware'), checkInRules, checkInController.checkIn);
router.get('/:bookingId/early-check-in-quote', checkInRules, checkInController.earlyQuote);

// HU-022 (Wagner) — Registrar la salida (check-out) del huesped.
router.post('/:bookingId/check-out', checkOutRules, checkOutController.checkOut);

// HU-127 (Marvin) — Gestionar la solicitud de extension de hospedaje.
// Sus tres endpoints viven en cabinExtension.* (un archivo por capa) para
// no mezclar esta HU con el resto del modulo.
router.get('/:bookingId/extension-quote', quoteCabinExtensionRules, extensionController.getQuote);
router.post('/:bookingId/extensions', extendCabinStayRules, extensionController.createExtension);

module.exports = router;
