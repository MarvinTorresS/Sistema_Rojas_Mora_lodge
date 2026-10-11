'use strict';

// Router de los PLANES DE PRECIOS del salon (HU-008 a HU-012). Se monta en
// /api/event-hall-plans, aparte de /api/hall-bookings (reservas), porque
// aqui el sujeto es el plan y no una reserva.
//
// Igual que en los demas routers del proyecto, cada quien reemplaza
// UNICAMENTE su propia linea cuando le toque su HU, sin tocar las de los
// demas (evita conflictos de Git).
//
// TODO (Sprint 5, autenticacion y roles): restringir estas rutas al rol
// Administrador. Hoy no existe autenticacion.
const express = require('express');
const controller = require('./eventHallPlans.controller');
const { createEventHallPlanRules, listEventHallPlansRules } = require('./eventHallPlans.validator');

const router = express.Router();

// HU-009 — Listar los planes de precios del salon.
// Query opcional: ?resourceId=&hours=&search=
router.get('/', listEventHallPlansRules, controller.listPlans);

// HU-008 — Registrar un nuevo plan de precios.
// Body: { planName, hours, price, includedServices?, depositPercentage?, resourceId? }
router.post('/', createEventHallPlanRules, controller.createPlan);

// HU-010 (Wagner) — Modificar un plan existente.
// TODO (Wagner, Sprint 2): PATCH /:planId

// HU-011 (Wagner) — Eliminar un plan que no tenga reservas asociadas.
// TODO (Wagner, Sprint 2): DELETE /:planId

module.exports = router;
