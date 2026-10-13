'use strict';

// Router del CRUD de planes de precio del salon de eventos
// (event_hall_pricing_plans): HU-008 a HU-012. Entidad DISTINTA de las
// reservas del salon (reservasSalon.routes.js) -- ver la nota alli sobre
// por que viven en archivos separados aunque compartan carpeta.
// Se monta bajo /api/event-hall-plans (ver app.js).
const express = require('express');
const controller = require('./eventHallPlans.controller');
const {
  searchPlansRules,
  updatePlanRules,
  deletePlanRules,
  createEventHallPlanRules,
  listEventHallPlansRules,
} = require('./eventHallPlans.validator');

const router = express.Router();

// HU-009 — Listar los planes de precios del salon.
router.get('/', listEventHallPlansRules, controller.listPlans);

// HU-008 — Registrar un nuevo plan de precios.
router.post('/', createEventHallPlanRules, controller.createPlan);

// HU-010 (Wagner) — Buscar un plan de precios del salon por nombre.
router.get('/search', searchPlansRules, controller.searchPlans);

// HU-011 (Wagner) — Editar los datos de un plan de precios existente.
router.put('/:planId', updatePlanRules, controller.updatePlan);

// HU-012 (Wagner) — Eliminar de forma permanente un plan de precios.
router.delete('/:planId', deletePlanRules, controller.deletePlan);

module.exports = router;

module.exports = router;
