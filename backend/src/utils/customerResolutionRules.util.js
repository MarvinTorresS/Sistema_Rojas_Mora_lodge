'use strict';

// Reglas de FORMA para los dos campos con los que el recepcionista
// responde al aviso CUSTOMER_PHONE_CONFLICT (ver
// services/customerResolution.service.js). Las comparten los validators
// de cancha y salon para que ambos acepten exactamente lo mismo.
//
// Ambos son OPCIONALES: en el primer intento no vienen, y solo se envian
// despues de que el backend aviso que el telefono ya tiene otro nombre.
const { body } = require('express-validator');

const customerResolutionRules = [
  // "Si, es ese cliente": id del cliente existente que se quiere usar.
  body('linkCustomerId')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('linkCustomerId debe ser un número entero positivo.')
    .toInt(),

  // "Es otra persona": crear un cliente nuevo aunque el telefono ya exista.
  body('confirmNewCustomer')
    .optional({ nullable: true })
    .isBoolean({ strict: true }).withMessage('confirmNewCustomer debe ser true o false.')
    .toBoolean(),

  // Las dos respuestas se contradicen: no tiene sentido mandar ambas.
  body('confirmNewCustomer')
    .custom((value, { req }) => !(value === true && req.body.linkCustomerId))
    .withMessage('Elegí usar el cliente existente o registrar otra persona, no ambas.'),
];

module.exports = { customerResolutionRules };
