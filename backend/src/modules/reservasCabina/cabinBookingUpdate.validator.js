'use strict';

// Validador de FORMA de la modificacion de una reserva de cabina (HU-019 --
// Sprint 3). Solo revisa que cada dato venga con el formato
// correcto; las reglas de negocio (estado, disponibilidad, check-in
// realizado) son del service. Mismas reglas de formato que el registro
// (HU-016) para que los dos formularios acepten exactamente lo mismo.
const { param, body } = require('express-validator');
const {
  GUEST_MESSAGES, normalizePhone, isValidEmail, isValidName, isFullName,
} = require('../../utils/guestData.util');
const { buildValidationErrorsHandler } = require('./reservasCabina.validator');
const { EDITABLE_FIELDS } = require('./cabinBookingUpdate.util');

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const updateErrorsHandler = buildValidationErrorsHandler((details) => details[0].message);

// Fecha opcional "AAAA-MM-DD" (existe en el calendario).
function optionalDate(field) {
  return body(field)
    .optional()
    .isString().withMessage(`${field} debe ser una fecha en formato AAAA-MM-DD.`).bail()
    .matches(DATE_ONLY_PATTERN).withMessage(`${field} debe tener el formato AAAA-MM-DD.`).bail()
    .isISO8601({ strict: true }).withMessage(`${field} no es una fecha válida.`);
}

const updateCabinBookingRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un entero positivo.'),

  // Debe venir al menos un campo, y solo campos editables. Si alguien manda
  // la identificacion (u otro campo) se avisa en vez de ignorarlo en
  // silencio: un cambio "aceptado" que no se aplica confunde.
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Indique los datos de la reserva que desea modificar.');
    }
    const keys = Object.keys(value);
    if (keys.length === 0) throw new Error('Indique al menos un dato de la reserva para modificar.');
    const unknown = keys.filter((key) => !EDITABLE_FIELDS.includes(key));
    if (unknown.length > 0) {
      throw new Error(`No se puede modificar: ${unknown.join(', ')}. Campos permitidos: ${EDITABLE_FIELDS.join(', ')}.`);
    }
    return true;
  }),

  body('resourceId')
    .optional()
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  optionalDate('checkInDate'),
  optionalDate('checkOutDate'),

  // 0 es valido (huesped viaja solo).
  body('companions')
    .optional()
    .isInt({ min: 0, max: 50 }).withMessage('companions debe ser un entero entre 0 y 50.'),

  body('guestName')
    .optional()
    .isString().withMessage('El nombre del huésped no es válido.').bail()
    .trim()
    .isLength({ min: 3, max: 150 }).withMessage('El nombre del huésped debe tener entre 3 y 150 caracteres.').bail()
    .custom(isValidName).withMessage(GUEST_MESSAGES.NAME).bail()
    .custom(isFullName).withMessage(GUEST_MESSAGES.FULL_NAME),

  body('guestPhone')
    .optional()
    .isString().withMessage(GUEST_MESSAGES.PHONE).bail()
    .custom((value) => normalizePhone(value) !== null).withMessage(GUEST_MESSAGES.PHONE)
    .customSanitizer((value) => normalizePhone(value) ?? value),

  body('guestEmail')
    .optional()
    .isString().withMessage(GUEST_MESSAGES.EMAIL).bail()
    .trim()
    .custom(isValidEmail).withMessage(GUEST_MESSAGES.EMAIL),

  updateErrorsHandler,
];

module.exports = { updateCabinBookingRules };
