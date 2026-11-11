'use strict';

const {
  param, body, query, validationResult,
} = require('express-validator');
const {
  MESSAGES, CODES, MIN_SEATS, MAX_SEATS, TABLE_LOCATION_MAX_LENGTH, normalizeTableNumber, isValidTableNumber,
} = require('./restaurante.util');

// Mismo formato de error 422 que el resto de modulos:
// { error: { message, details: [{ field, message }] } }.
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return res.status(422).json({ error: { message: details[0].message, details } });
  }
  return next();
}

const deactivateTableRules = [
  param('tableId').isInt({ min: 1 }).withMessage('El identificador de la mesa debe ser un entero positivo.'),
  body('confirmed')
    .custom((value) => value === true)
    .withMessage('Debe confirmar la desactivación de la mesa.'),
  handleValidationErrors,
];

const deleteTableRules = [
  param('tableId').isInt({ min: 1 }).withMessage('El identificador de la mesa debe ser un entero positivo.'),
  body('confirmed').custom((value) => value === true).withMessage('Debe confirmar la eliminación permanente.'),
  body('adminApproval.email').isString().bail().trim().isEmail().isLength({ max: 150 })
    .withMessage('Indique el correo del Administrador.'),
  body('adminApproval.password').custom((value) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Indique una contraseña válida.'),
  // No devolver credenciales en los detalles de validación.
  handleValidationErrors,
];

// ---------------------------------------------------------------------
// Sprint 4 (Marvin) - HU-102 y HU-104.
// ---------------------------------------------------------------------

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const isPositiveId = (value) => Number.isSafeInteger(value) && value >= 1;

// Mensaje de un campo obligatorio: se marca con `required` para que el
// manejador responda el texto general de CA-3 y el code REQUIRED_FIELDS.
const requiredMessage = (message) => ({ message, required: true });

// Igual que handleValidationErrors (mismo formato 422), pero si falta algun
// campo obligatorio el mensaje general es "Los campos marcados con (*) son
// obligatorios" y se agrega code: REQUIRED_FIELDS. details trae un elemento
// por campo para que el frontend marque cada uno en rojo.
function handleRequiredFieldErrors(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const raw = errors.array();
  const details = raw.map((e) => ({ field: e.path, message: typeof e.msg === 'object' ? e.msg.message : e.msg }));
  const missing = raw.some((e) => typeof e.msg === 'object' && e.msg.required);
  return res.status(422).json({
    error: missing
      ? { message: MESSAGES.REQUIRED_FIELDS, code: CODES.REQUIRED_FIELDS, details }
      : { message: details[0].message, details },
  });
}

const TABLE_NUMBER_FORMAT = 'El número de mesa admite hasta 10 letras, dígitos o guiones.';
const isTableNumber = (value) => (typeof value === 'string' || typeof value === 'number')
  && isValidTableNumber(normalizeTableNumber(value));
const isSeatCount = (value) => {
  const number = typeof value === 'string' && /^\s*\d{1,6}\s*$/.test(value) ? Number(value) : value;
  return Number.isInteger(number) && number >= MIN_SEATS && number <= MAX_SEATS;
};

// HU-102 - POST /api/restaurant-tables
const createTableRules = [
  body('tableNumber').custom((value) => !isBlank(value))
    .withMessage(requiredMessage('El número de mesa es obligatorio.')).bail()
    .custom(isTableNumber).withMessage(TABLE_NUMBER_FORMAT),
  body('seatCount').custom((value) => !isBlank(value))
    .withMessage(requiredMessage('La capacidad (comensales) es obligatoria.')).bail()
    .custom(isSeatCount).withMessage(`La capacidad debe ser un número entero entre ${MIN_SEATS} y ${MAX_SEATS}.`),
  body('location').optional({ values: 'null' })
    .isString().withMessage('La ubicación debe ser texto.').bail()
    .custom((value) => value.trim().length <= TABLE_LOCATION_MAX_LENGTH)
    .withMessage(`La ubicación admite hasta ${TABLE_LOCATION_MAX_LENGTH} caracteres.`),
  body('userId').optional({ values: 'null' }).custom(isPositiveId)
    .withMessage('El usuario debe ser un entero positivo.'),
  handleRequiredFieldErrors,
];

// HU-104 - GET /api/restaurant-tables?number=&minSeats= (ambos opcionales).
// Un parametro vacio (?number=) se trata como ausente.
const searchTablesRules = [
  query('number').optional({ values: 'falsy' })
    .isString().withMessage('Indique un solo número de mesa.').bail()
    .custom(isTableNumber).withMessage(TABLE_NUMBER_FORMAT),
  query('minSeats').optional({ values: 'falsy' })
    .isString().withMessage('Indique una sola capacidad mínima.').bail()
    .custom(isSeatCount)
    .withMessage(`La capacidad mínima debe ser un número entero entre ${MIN_SEATS} y ${MAX_SEATS}.`),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors, deactivateTableRules, deleteTableRules,
  handleRequiredFieldErrors, requiredMessage, createTableRules, searchTablesRules,
};
