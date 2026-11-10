'use strict';

// Validadores de forma para las reservas del salon de eventos
// (HU-007, HU-013 en Sprint 2 -- Marvin). El salon se reserva por dia:
// ya no hay planes de precio ni horas extra.
//
// Igual que en reservasCancha.validator.js: esto solo valida FORMA,
// nunca reglas de negocio (eso es del service).
const { body, param, query, validationResult } = require('express-validator');
const { GUEST_MESSAGES, normalizePhone, isValidName } = require('../../utils/guestData.util');

// NOTA (duplicado intencional, no un descuido): esta misma funcion ya
// existe en reservasCancha.validator.js. Es identica y 100% generica
// (no depende de nada especifico de cancha ni de salon), asi que es
// candidata a moverse a un utils compartido igual que se hizo con
// DomainError y el solapamiento de horario -- se dejo duplicada por
// ahora para no ampliar el refactor de esta sesion mas alla de lo que
// se acordo con Marvin; queda anotado como mejora futura.
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

// El salon se reserva por DIA: la unica fecha que llega es yyyy-mm-dd (las
// horas de entrada y salida las fija el servidor, ver reservasSalon.schedule.util.js).
const dateRule = (source, field = 'date') => source(field)
  .exists({ checkFalsy: true }).withMessage('La fecha de la reserva es obligatoria.').bail()
  .isString().bail()
  .isDate({ format: 'YYYY-MM-DD', strictMode: true })
  .withMessage('La fecha debe ser valida con formato yyyy-mm-dd.');

// HU-007 (GET /api/hall-bookings/availability): consultar disponibilidad.
// Cubre CA-4 "Fecha fuera de rango permitido" en su forma (fecha real,
// ISO 8601); el rango de dias permitido en si lo valida el service,
// que es quien conoce la politica de negocio (MAX_ADVANCE_BOOKING_DAYS).
const checkAvailabilityRules = [
  query('resourceId')
    .exists({ checkFalsy: true }).withMessage('Debe indicar el salon (resourceId).')
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  dateRule(query),

  handleValidationErrors,
];

// HU-013 (POST /api/hall-bookings): registrar la reserva de un dia.
// Cubre CA-4 "Campos obligatorios incompletos".
const createHallBookingRules = [
  body('resourceId')
    .exists({ checkFalsy: true }).withMessage('Debe indicar el salon (resourceId).')
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  body('customerName')
    .exists({ checkFalsy: true }).withMessage('El nombre del cliente es obligatorio.')
    .isString().trim().isLength({ min: 3, max: 150 })
    .withMessage('El nombre del cliente debe tener entre 3 y 150 caracteres.').bail()
    .custom(isValidName).withMessage(GUEST_MESSAGES.NAME),

  // 8 digitos (se acepta +506, espacios y guiones); se guarda solo con los 8.
  body('customerPhone')
    .exists({ checkFalsy: true }).withMessage('El telefono del cliente es obligatorio.').bail()
    .isString().withMessage(GUEST_MESSAGES.PHONE).bail()
    .custom((value) => normalizePhone(value) !== null).withMessage(GUEST_MESSAGES.PHONE)
    .customSanitizer((value) => normalizePhone(value) ?? value),

  dateRule(body),

  handleValidationErrors,
];

const bookingIdRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un entero positivo.'),
  handleValidationErrors,
];

const listHallBookingsRules = [
  query('page').optional().isInt({ min: 1, max: 1000000 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  ...['date', 'dateFrom', 'dateBefore'].map((name) => query(name).optional()
    .isDate({ format: 'YYYY-MM-DD', strictMode: true })
    .withMessage(`${name} debe ser una fecha valida con formato yyyy-mm-dd.`)),
  query('status').optional()
    .isIn(['pending', 'active', 'rejected', 'checked_in', 'completed', 'cancelled'])
    .withMessage('status no corresponde a un estado de reserva valido.'),
  handleValidationErrors,
];

const updateHallBookingRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un entero positivo.'),
  body().custom((value) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => key === 'date'))
    .withMessage('Solo se puede modificar la fecha (date) de la reserva.'),
  dateRule(body),
  handleValidationErrors,
];

const cancelHallBookingRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un entero positivo.'),
  body().custom((value) => value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => key === 'cancellationReason')))
    .withMessage('Solo se permite cancellationReason.'),
  body('cancellationReason').optional().isString().bail().trim().isLength({ max: 250 })
    .withMessage('El motivo debe tener como maximo 250 caracteres.'),
  handleValidationErrors,
];

module.exports = {
  cancelHallBookingRules,
  bookingIdRules,
  listHallBookingsRules,
  updateHallBookingRules,
  handleValidationErrors,
  checkAvailabilityRules,
  createHallBookingRules,
};
