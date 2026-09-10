'use strict';

// Validadores de forma para el modulo de reservas de cancha sintetica
// (HU-001 a HU-006). Usan express-validator: cada funcion es un
// middleware que corre ANTES del controller y corta la peticion con un
// 422 si algo esta mal formado, sin que el controller ni el service
// tengan que preocuparse por eso.
//
// Importante: esto solo valida FORMA (¿vino el campo? ¿es una fecha
// valida? ¿es un numero positivo?), nunca reglas de NEGOCIO (¿esa
// fecha ya esta ocupada? ¿el cliente existe?). Esas preguntas son
// responsabilidad exclusiva del service (ver reservasCancha.service.js),
// porque para responderlas hace falta consultar la base de datos, y el
// validator no deberia hacer eso.
const { body, validationResult } = require('express-validator');

// Middleware generico que revisa si express-validator encontro errores
// en las reglas declaradas antes de el, y si los hay corta la cadena
// con un 422 (Unprocessable Entity: "la forma de la peticion esta mal").
// Se reutiliza en TODAS las rutas del modulo, no solo en crear.
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: {
        message: 'Datos de la reserva incompletos o con formato invalido.',
        details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      },
    });
  }
  return next();
}

// Reglas para HU-001 (POST /api/field-bookings): crear una reserva.
// Cubre CA-3 "Campos obligatorios incompletos" de la matriz de
// trazabilidad. Los campos que identifican al cliente (customerId o los
// datos para crear uno nuevo) y el resourceId se resuelven en el
// service, aqui solo se exige que la forma minima este presente.
const createBookingRules = [
  body('resourceId')
    .exists({ checkFalsy: true }).withMessage('Debe indicar la cancha (resourceId).')
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  body('customerName')
    .exists({ checkFalsy: true }).withMessage('El nombre del cliente es obligatorio.')
    .isString().trim().isLength({ min: 3, max: 150 })
    .withMessage('El nombre del cliente debe tener entre 3 y 150 caracteres.'),

  body('customerPhone')
    .exists({ checkFalsy: true }).withMessage('El telefono del cliente es obligatorio.')
    .isString().trim().isLength({ min: 8, max: 20 })
    .withMessage('El telefono del cliente no es valido.'),

  body('startDatetime')
    .exists({ checkFalsy: true }).withMessage('La fecha y hora de inicio son obligatorias.')
    .isISO8601().withMessage('startDatetime debe ser una fecha valida (formato ISO 8601).'),

  body('endDatetime')
    .exists({ checkFalsy: true }).withMessage('La fecha y hora de fin son obligatorias.')
    .isISO8601().withMessage('endDatetime debe ser una fecha valida (formato ISO 8601).'),

  handleValidationErrors,
];

module.exports = {
  createBookingRules,
  handleValidationErrors,
};
