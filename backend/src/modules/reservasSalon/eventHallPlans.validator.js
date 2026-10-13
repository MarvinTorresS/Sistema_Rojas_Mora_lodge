'use strict';

'use strict';

// Validadores de forma para el CRUD de planes de precio del salon de
// eventos. Mantiene la validacion de forma separada de la logica de
// negocio, y une la version de Wagner (buscar/editar/eliminar) con la de
// Alison (listar/crear) sin duplicar la fuente de verdad.
const { body, param, query, validationResult } = require('express-validator');
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

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: {
        message: 'Datos del plan de precios incompletos o con formato invalido.',
        details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      },
    });
  }
  return next();
}

function handlePlanValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return res.status(422).json({ error: { message: details[0].message, details } });
  }
  return next();
}

function failWith(getError) {
  return (value) => {
    const error = getError(value);
    if (error) throw new Error(error);
    return true;
  };
}
  }
  return next();
}

// HU-010 (GET /api/event-hall-plans/search?name=...): buscar por
// nombre. `name` es obligatorio porque sin el no hay busqueda que
// hacer (para listar todos los planes existe HU-009, GET /).
const searchPlansRules = [
  query('name')
    .exists({ checkFalsy: true }).withMessage('Debe indicar el nombre (o parte del nombre) a buscar.')
    .isString().trim().isLength({ min: 1, max: 50 })
    .withMessage('name debe tener entre 1 y 50 caracteres.'),

  handleValidationErrors,
];

// HU-011 (PUT /api/event-hall-plans/:planId): editar un plan existente.
const updatePlanRules = [
  param('planId')
    .isInt({ min: 1 }).withMessage('planId debe ser un numero entero positivo.'),

  body('planName')
    .exists({ checkFalsy: true }).withMessage('El nombre del plan es obligatorio.')
    .isString().trim().isLength({ min: 1, max: 50 })
    .withMessage('planName debe tener entre 1 y 50 caracteres.'),

  body('hours')
    .exists({ checkFalsy: true }).withMessage('La cantidad de horas del plan es obligatoria.')
    .isInt({ min: 1 }).withMessage('hours debe ser un numero entero positivo.'),

  body('price')
    .exists({ checkFalsy: true }).withMessage('El precio del plan es obligatorio.')
    .isFloat({ min: 0.01 }).withMessage('price debe ser un numero mayor a 0.'),

  handleValidationErrors,
];

// HU-012 (DELETE /api/event-hall-plans/:planId): eliminar
// permanentemente. Sin cuerpo: el unico dato que hace falta viaja en
// la URL.
const deletePlanRules = [
  param('planId')
    .isInt({ min: 1 }).withMessage('planId debe ser un numero entero positivo.'),

  handleValidationErrors,
];

// HU-008 (POST /api/event-hall-plans): registrar un plan.
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
// por salon, por duracion en horas y por texto en el nombre.
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

module.exports = {
  handleValidationErrors,
  handlePlanValidationErrors,
  failWith,
  searchPlansRules,
  updatePlanRules,
  deletePlanRules,
  createEventHallPlanRules,
  listEventHallPlansRules,
};
