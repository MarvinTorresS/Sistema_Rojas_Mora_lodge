'use strict';

// Validadores de forma para el CRUD de planes de precio del salon de
// eventos (HU-008 a HU-012). Entidad distinta de las reservas del
// salon (reservasSalon.validator.js) -- ver la nota alli. Igual que en
// los demas modulos: esto solo valida FORMA, nunca reglas de negocio
// (existencia del plan, reservas asociadas, etc. -- eso es del
// service).
const { body, param, query, validationResult } = require('express-validator');

// NOTA (duplicado intencional): misma funcion que en
// reservasCancha.validator.js y reservasSalon.validator.js. Genérica al
// 100%, candidata a moverse a un validators/ compartido -- se deja
// duplicada por ahora, mismo criterio que reservasSalon.validator.js.
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
// Se exigen los 3 campos completos (no es un PATCH parcial): la HU dice
// "editar los DATOS de un plan", y sin uno de los tres no hay forma de
// recalcular consistentemente el anticipo (HU-013) para las reservas
// futuras. Cubre CA-3 "Campos obligatorios incompletos".
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

module.exports = {
  handleValidationErrors,
  searchPlansRules,
  updatePlanRules,
  deletePlanRules,
};
