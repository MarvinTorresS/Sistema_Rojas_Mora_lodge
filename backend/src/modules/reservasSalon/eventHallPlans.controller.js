'use strict';

// Traductor HTTP <-> service de los planes de precios del salon (HU-008 y
// HU-009). Igual de "tonto" que los otros controllers: no valida ni decide
// reglas; los DomainError del service van tal cual al errorHandler.
const eventHallPlansService = require('./eventHallPlans.service');
const { DomainError } = require('../../utils/domainError.util');

// Si la base de datos no tiene las columnas o tablas que usa el codigo (se
// bajo el codigo nuevo pero no se corrio `pnpm migrate`), MySQL responde con
// un texto tecnico ("Unknown column ...") que no ayuda a quien esta probando.
// Aqui se cambia por una indicacion concreta; cualquier otro error pasa igual.
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

module.exports = { listPlans, createPlan, translateError };
