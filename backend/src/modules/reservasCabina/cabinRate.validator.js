'use strict';

// Validadores de FORMA de la edicion de tarifa (HU-128 -- Marvin, Sprint
// 3). La regla de que es una tarifa valida NO se escribe aqui: viene de
// cabinStay.util.js y es la misma que usa el service (una sola fuente de
// verdad). Este archivo solo la conecta con express-validator.
const { param, body } = require('express-validator');
const { buildValidationErrorsHandler } = require('./reservasCabina.validator');
const { getNightlyRateError } = require('./cabinStay.util');

// El mensaje general de la respuesta 422 debe ser el del criterio de
// aceptacion ("La tarifa debe ser un monto mayor a cero"), no el de
// "reserva" que usan HU-016/HU-127. Si la falla es de la tarifa se usa su
// mensaje; si fue solo el id, el primero que haya.
const rateErrorsHandler = buildValidationErrorsHandler((details) => (
  (details.find((detail) => detail.field === 'pricePerNight') || details[0]).message
));

const updateCabinRateRules = [
  param('resourceId')
    .isInt({ min: 1 }).withMessage('resourceId debe ser un entero positivo.'),
  body('pricePerNight').custom((value) => {
    const error = getNightlyRateError(value);
    if (error) throw new Error(error);
    return true;
  }),
  rateErrorsHandler,
];

module.exports = { updateCabinRateRules };
