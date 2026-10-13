'use strict';

// Validadores de FORMA de la extension de hospedaje (HU-127 -- Marvin,
// Sprint 3). Solo revisan que el dato venga y tenga el formato correcto;
// las reglas de negocio (estado, disponibilidad, tope de noches) son del
// service. Reusan la regla de fecha y el manejo de errores del validator
// de HU-016 para que todo el modulo responda igual.
const { param, body, query } = require('express-validator');
const { handleValidationErrors, dateOnlyRule } = require('./reservasCabina.validator');

const bookingIdRule = param('bookingId')
  .isInt({ min: 1 }).withMessage('bookingId debe ser un entero positivo.');

// POST /:bookingId/extensions — la fecha va en el cuerpo.
const extendCabinStayRules = [
  bookingIdRule,
  dateOnlyRule(body, 'newCheckOutDate', 'Debe indicar la nueva fecha de salida (newCheckOutDate).'),
  handleValidationErrors,
];

// GET /:bookingId/extension-quote — la fecha va en la URL.
const quoteCabinExtensionRules = [
  bookingIdRule,
  dateOnlyRule(query, 'newCheckOutDate', 'Debe indicar la nueva fecha de salida (newCheckOutDate).'),
  handleValidationErrors,
];

// GET /extendable — busqueda opcional por nombre o identificacion.
const listExtendableRules = [
  query('search')
    .optional()
    .isString().bail()
    .isLength({ max: 100 }).withMessage('search no puede superar 100 caracteres.'),
  handleValidationErrors,
];

module.exports = {
  extendCabinStayRules,
  quoteCabinExtensionRules,
  listExtendableRules,
};
