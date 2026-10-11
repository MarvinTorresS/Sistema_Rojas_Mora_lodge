'use strict';

// Validadores de FORMA de los planes de precios del salon (HU-008 y
// HU-009 -- Sprint 2). Las reglas de que es un nombre, una duracion
// o un precio valido NO se escriben aqui: viven en eventHallPlans.util.js y
// son las mismas que usa el service (una sola fuente de verdad). Este
// archivo solo las conecta con express-validator.
//
// Archivo propio (y no agregar reglas a reservasSalon.validator.js) porque
// planes y reservas son dos entidades distintas; ver el encabezado de
// reservasSalon.routes.js.
const { body, query, validationResult } = require('express-validator');
const {
  getPlanNameError,
  getPlanHoursError,
  getPlanPriceError,
  normalizeIncludedServices,
  normalizeDepositPercentage,
  normalizeExtraHourPrice,
  MIN_PLAN_HOURS,
  MAX_PLAN_HOURS,
} = require('./eventHallPlans.util');

// Si algo falla, el mensaje general es el del PRIMER campo con error (el
// mismo mensaje que ve el usuario junto al campo) y `details` trae todos,
// para que la pantalla marque cada campo. Mismo formato de respuesta que
// el resto de validadores del proyecto: { error: { message, details } }.
function handlePlanValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return res.status(422).json({ error: { message: details[0].message, details } });
  }
  return next();
}

// Convierte una funcion "devuelve el texto del error o null" en un
// validador custom de express-validator.
function failWith(getError) {
  return (value) => {
    const error = getError(value);
    if (error) throw new Error(error);
    return true;
  };
}

// HU-008 (POST /api/event-hall-plans): registrar un plan.
// CA-1 plan completo, CA-3 campos obligatorios (nombre, duracion, precio).
// La unicidad del nombre (CA-2) NO se revisa aqui: necesita la base de
// datos y es regla de negocio, asi que la decide el service.
const createEventHallPlanRules = [
  body('resourceId')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  body('planName').custom(failWith(getPlanNameError)),
  body('hours').custom(failWith(getPlanHoursError)),
  body('price').custom(failWith(getPlanPriceError)),

  body('includedServices').custom(failWith((value) => normalizeIncludedServices(value).error)),
  body('depositPercentage').custom(failWith((value) => normalizeDepositPercentage(value).error)),
  body('extraHourPrice').custom(failWith((value) => normalizeExtraHourPrice(value).error)),

  handlePlanValidationErrors,
];

// HU-009 (GET /api/event-hall-plans): listar planes, con filtros opcionales
// por salon, por duracion en horas (CA-2) y por texto en el nombre.
const listEventHallPlansRules = [
  query('resourceId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  query('hours')
    .optional({ checkFalsy: true })
    .isInt({ min: MIN_PLAN_HOURS, max: MAX_PLAN_HOURS })
    .withMessage(`La duración debe ser un número entero de horas entre ${MIN_PLAN_HOURS} y ${MAX_PLAN_HOURS}.`),

  query('search')
    .optional()
    .isString().withMessage('El texto de búsqueda no es válido.')
    .isLength({ max: 100 }).withMessage('El texto de búsqueda es demasiado largo.'),

  handlePlanValidationErrors,
];

module.exports = { createEventHallPlanRules, listEventHallPlansRules };
