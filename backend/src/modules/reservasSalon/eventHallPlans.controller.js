'use strict';

// Traductor HTTP <-> service para el CRUD de planes de precio del
// salon. Tan "tonto" como los demas controllers: no valida forma (ya
// lo hizo el validator) ni decide reglas de negocio (eso es el
// service).
const eventHallPlansService = require('./eventHallPlans.service');

// GET /api/event-hall-plans/search?name=... — HU-010.
async function searchPlans(req, res, next) {
  try {
    const plans = await eventHallPlansService.searchPlansByName({ name: req.query.name });
    return res.json({ data: plans });
  } catch (error) {
    return next(error);
  }
}

// PUT /api/event-hall-plans/:planId — HU-011.
async function updatePlan(req, res, next) {
  try {
    const result = await eventHallPlansService.updateHallPlan(req.params.planId, req.body);
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
}

// DELETE /api/event-hall-plans/:planId — HU-012.
async function deletePlan(req, res, next) {
  try {
    const result = await eventHallPlansService.deleteHallPlan(req.params.planId);
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  searchPlans,
  updatePlan,
  deletePlan,
};
