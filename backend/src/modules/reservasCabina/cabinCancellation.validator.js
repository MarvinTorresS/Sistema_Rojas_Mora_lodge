'use strict';
const { param } = require('express-validator');
const { buildValidationErrorsHandler } = require('./reservasCabina.validator');
const cancelCabinBookingRules = [
  param('bookingId').isInt({ min: 1, max: 2147483647 }).withMessage('bookingId debe ser un entero positivo válido.'),
  buildValidationErrorsHandler((details) => details[0].message),
];
module.exports = { cancelCabinBookingRules };
