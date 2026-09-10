'use strict';

// Router del modulo de reservas de cancha sintetica (HU-001 a HU-006).
// Se monta en app.js bajo el prefijo /api/field-bookings. Cada ruta
// sigue el mismo orden de capas: validator (forma) -> controller (HTTP)
// -> service (negocio, ya llamado dentro del controller).
//
// Las 6 rutas del modulo se declaran aqui desde el inicio, aunque solo
// HU-001 tiene logica implementada, para que este archivo compartido
// quede estable: cuando a cada quien le toque su HU, reemplaza
// UNICAMENTE su propia linea de router.<verbo>(...), nunca las de los
// demas, evitando conflictos de Git (misma convencion que se uso en
// frontend/src/App.jsx).
const express = require('express');
const controller = require('./reservasCancha.controller');
const { createBookingRules } = require('./reservasCancha.validator');

const router = express.Router();

// HU-001 (Marvin) — Registrar una nueva reserva de cancha sintetica.
router.post('/', createBookingRules, controller.createBooking);

// TODO (Wagner — HU-002): listar reservas registradas.
// router.get('/', listBookingsRules, controller.listBookings);

// TODO (Kendall — HU-003): buscar por cliente, telefono o fecha.
// router.get('/search', searchBookingsRules, controller.searchBookings);

// TODO (Alison — HU-004): filtrar por estado.
// router.get('/filter', filterBookingsRules, controller.filterBookingsByStatus);

// TODO (Kendall — HU-005): modificar una reserva existente.
// router.patch('/:bookingId', updateBookingRules, controller.updateBooking);

// TODO (Alison — HU-006): cancelar una reserva existente.
// router.post('/:bookingId/cancel', cancelBookingRules, controller.cancelBooking);

module.exports = router;
