'use strict';

// Router del CRUD de planes de precio del salon de eventos
// (event_hall_pricing_plans): HU-008 a HU-012. Entidad DISTINTA de las
// reservas del salon (reservasSalon.routes.js) -- ver la nota alli
// sobre por que viven en archivos separados aunque compartan carpeta.
// Se monta bajo /api/event-hall-plans (ver app.js).
//
// Misma convencion que reservasCancha.routes.js y
// reservasSalon.routes.js: todas las rutas de la entidad se dejan
// anotadas desde el inicio, aunque solo HU-010/HU-011/HU-012 tengan
// logica implementada, para que este archivo compartido quede estable.
// Cuando a Alison le toque HU-008/HU-009, reemplaza UNICAMENTE sus
// propias lineas de router.<verbo>(...).
const express = require('express');
const controller = require('./eventHallPlans.controller');
const {
  searchPlansRules, updatePlanRules, deletePlanRules,
} = require('./eventHallPlans.validator');

const router = express.Router();

// HU-008 (Alison) — Registrar un nuevo plan de precios para el salon.
// TODO (Alison, Sprint 2): router.post('/', createPlanRules, controller.createPlan);

// HU-009 (Alison) — Consultar los planes de precios disponibles.
// TODO (Alison, Sprint 2): router.get('/', listPlansRules, controller.listPlans);

// HU-010 (Wagner) — Buscar un plan de precios del salon por nombre.
router.get('/search', searchPlansRules, controller.searchPlans);

// HU-011 (Wagner) — Editar los datos de un plan de precios existente.
router.put('/:planId', updatePlanRules, controller.updatePlan);

// HU-012 (Wagner) — Eliminar de forma permanente un plan de precios.
router.delete('/:planId', deletePlanRules, controller.deletePlan);

module.exports = router;
