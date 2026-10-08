'use strict';

// Router de las CABINAS como recurso (HU-128: tarifa por noche). Se monta
// en /api/cabins, aparte de /api/cabin-bookings, porque aqui el sujeto es
// la cabina y no una reserva (mismo criterio que preve el proyecto para los
// planes del salon: /api/event-hall-plans junto a /api/hall-bookings).
//
// TODO (Sprint 5, autenticacion y roles): restringir estas rutas al rol
// Administrador. Hoy no existe autenticacion; cuando exista, aqui va el
// middleware de rol y se pasa el usuario al service para la auditoria.
const express = require('express');
const controller = require('./cabinRate.controller');
const { updateCabinRateRules } = require('./cabinRate.validator');

const router = express.Router();

// HU-128 (Marvin) — Cabinas con su tarifa vigente.
router.get('/', controller.listCabinRates);

// HU-128 (Marvin) — Editar la tarifa por noche de una cabina.
// Body: { pricePerNight }
router.patch('/:resourceId/rate', updateCabinRateRules, controller.updateCabinRate);

module.exports = router;
