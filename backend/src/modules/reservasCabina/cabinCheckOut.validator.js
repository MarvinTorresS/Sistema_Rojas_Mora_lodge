'use strict';
const { param } = require('express-validator');
const { buildValidationErrorsHandler } = require('./reservasCabina.validator');
const checkOutRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('El identificador de la reserva debe ser un entero positivo.'),
  buildValidationErrorsHandler((details) => details[0].message),
];
module.exports = { checkOutRules };
