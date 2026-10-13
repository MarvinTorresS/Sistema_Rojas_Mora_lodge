'use strict';

// Traductor HTTP <-> service para el CRUD de planes de precio del
// salon. Tan "tonto" como los demas controllers: no valida forma ni
// decide reglas de negocio. Este archivo soporta tanto la funcionalidad
// de Wagner (buscar/editar/eliminar) como la de Alison (listar/crear) y
// normaliza errores de esquema desactualizado.
const eventHallPlansService = require('./eventHallPlans.service');
const { DomainError } = require('../../utils/domainError.util');

const OUTDATED_SCHEMA_CODES = ['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'];
const OUTDATED_SCHEMA_MESSAGE = 'La base de datos no está actualizada. '
  + 'Ejecutá `pnpm migrate` en la carpeta backend y reiniciá el servidor.';

function translateError(error) {
  const code = error?.parent?.code || error?.original?.code;
  if (OUTDATED_SCHEMA_CODES.includes(code)) {
    return new DomainError(OUTDATED_SCHEMA_MESSAGE, 500, { code: 'DATABASE_OUTDATED' });
  }
  return error;
}

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
    const result = await eventHallPlansService.updateHallPlan(req.params.planId, req.body, {
      userId: req.user?.userId ?? null,
    });
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

// GET /api/event-hall-plans — HU-009.
async function listPlans(req, res, next) {
  try {
    const { items, ...meta } = await eventHallPlansService.listEventHallPlans({
      resourceId: req.query.resourceId,
      hours: req.query.hours,
      search: req.query.search,
    });
    return res.json({ data: items, meta });
  } catch (error) {
    return next(translateError(error));
  }
}

// POST /api/event-hall-plans — HU-008. 201: se crea un recurso nuevo.
async function createPlan(req, res, next) {
  try {
    const data = await eventHallPlansService.createEventHallPlan(req.body);
    return res.status(201).json({ data });
  } catch (error) {
    return next(translateError(error));
  }
}

module.exports = {
  searchPlans,
  updatePlan,
  deletePlan,
  listPlans,
  createPlan,
  translateError,
};
