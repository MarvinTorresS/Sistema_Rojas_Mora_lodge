'use strict';

// Validadores de forma para las reservas del salon de eventos
// (HU-007, HU-013 en Sprint 2 -- Marvin). El CRUD de planes de precio
// (HU-008, HU-009, HU-010, HU-011, HU-012) vive en un archivo
// hermano, eventHallPlans.*, que Alison/Wagner agregan a esta misma
// carpeta cuando les toque: reservas y planes son dos entidades
// distintas (event_hall_pricing_plans vs. bookings) aunque compartan
// la misma area funcional "salon", asi que cada una tiene su propio
// router/validator/service/controller en vez de mezclarse en un solo
// archivo gigante.
//
// Igual que en reservasCancha.validator.js: esto solo valida FORMA,
// nunca reglas de negocio (eso es del service).
const { body, param, query, validationResult } = require('express-validator');

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

// HU-007 (GET /api/hall-bookings/availability): consultar disponibilidad.
// Cubre CA-4 "Fecha fuera de rango permitido" en su forma (fecha real,
// ISO 8601); el rango de dias permitido en si lo valida el service,
// que es quien conoce la politica de negocio (MAX_ADVANCE_BOOKING_DAYS).
const checkAvailabilityRules = [
  query('resourceId')
    .exists({ checkFalsy: true }).withMessage('Debe indicar el salon (resourceId).')
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  query('startDatetime')
    .exists({ checkFalsy: true }).withMessage('La fecha y hora de inicio son obligatorias.')
    .isISO8601().withMessage('startDatetime debe ser una fecha valida (formato ISO 8601).'),

  query('endDatetime')
    .exists({ checkFalsy: true }).withMessage('La fecha y hora de fin son obligatorias.')
    .isISO8601().withMessage('endDatetime debe ser una fecha valida (formato ISO 8601).'),

  handleValidationErrors,
];

// HU-013 (POST /api/hall-bookings): registrar una reserva con plan.
// Cubre CA-4 "Campos obligatorios incompletos". planId es obligatorio
// aqui (a diferencia de cancha, que no tiene planes): sin plan no hay
// como calcular el anticipo (CA-3), que es responsabilidad del service.
const createHallBookingRules = [
  body('resourceId')
    .exists({ checkFalsy: true }).withMessage('Debe indicar el salon (resourceId).')
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  body('planId')
    .exists({ checkFalsy: true }).withMessage('Debe indicar el plan de precios seleccionado (planId).')
    .isInt({ min: 1 }).withMessage('planId debe ser un numero entero positivo.'),

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

const bookingIdRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un entero positivo.'),
  handleValidationErrors,
];

const listHallBookingsRules = [
  query('page').optional().isInt({ min: 1, max: 1000000 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  handleValidationErrors,
];

const updateHallBookingRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un entero positivo.'),
  body().custom((value) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length > 0 && Object.keys(value).every((key) => ['planId', 'startDatetime', 'endDatetime'].includes(key)))
    .withMessage('Indique plan, inicio o fin. Solo se permiten planId, startDatetime y endDatetime.'),
  body('planId').optional().isInt({ min: 1 }).withMessage('planId debe ser un entero positivo.'),
  ...['startDatetime', 'endDatetime'].map((field) => body(field).optional()
    .isString().bail().isISO8601({ strict: true, strictSeparator: true }).bail()
    .custom((value) => /T\d{2}:\d{2}/.test(value) && Number.isFinite(new Date(value).getTime()))
    .withMessage('Debe indicar una fecha y hora ISO 8601 valida.')),
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
