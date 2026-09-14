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
const { body, param, query, validationResult } = require('express-validator');

// Estados de reserva validos para el filtro opcional de HU-002. Misma
// lista que el ENUM de booking.model.js; se repite aqui (y no se importa
// del service) para que el validator no dependa de la capa de negocio.
const BOOKING_STATUSES = ['pending', 'active', 'rejected', 'checked_in', 'completed', 'cancelled'];

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

// Reglas para HU-002 (GET /api/field-bookings): listar reservas.
// Los cuatro parametros son OPCIONALES y viajan en el query string; si
// no vienen, el service usa sus valores por defecto. Solo se valida la
// FORMA: que la fecha sea una fecha, que el estado sea uno conocido,
// que page/pageSize sean enteros dentro de rango. El filtrado real y la
// paginacion los hace el service.
const listBookingsRules = [
  query('date')
    .optional()
    // strictMode: exige EXACTAMENTE el formato yyyy-mm-dd y ademas que
    // sea una fecha real (rechaza 2026-13-45, 2026-02-30, etc.), a
    // diferencia de una regex de forma que dejaria pasar meses/dias
    // imposibles.
    .isDate({ format: 'YYYY-MM-DD', strictMode: true })
    .withMessage('date debe ser una fecha valida con formato yyyy-mm-dd.'),

  query('status')
    .optional()
    .isIn(BOOKING_STATUSES)
    .withMessage('status no corresponde a un estado de reserva valido.'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page debe ser un entero mayor o igual a 1.'),

  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('pageSize debe ser un entero entre 1 y 100.'),

  handleValidationErrors,
];

// HU-003: los campos vacios se consideran criterios ausentes.
const searchBookingsRules = [
  query('customerName').optional().isString().bail().trim()
    .isLength({ max: 150 }).withMessage('El cliente debe tener como maximo 150 caracteres.'),
  query('phone').optional().isString().bail().trim()
    .isLength({ max: 20 }).withMessage('El telefono debe tener como maximo 20 caracteres.'),
  query('date').optional().isString().bail().trim()
    .custom((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value))
    .withMessage('date debe tener formato yyyy-mm-dd.').bail()
    .if((value) => value !== '')
    .isDate({ format: 'YYYY-MM-DD', strictMode: true })
    .withMessage('date debe ser una fecha valida.'),
  query('page').optional().isString().bail().isInt({ min: 1 })
    .withMessage('page debe ser un entero mayor o igual a 1.'),
  query('pageSize').optional().isString().bail().isInt({ min: 1, max: 100 })
    .withMessage('pageSize debe ser un entero entre 1 y 100.'),
  query().custom((value) => ['customerName', 'phone', 'date']
    .some((field) => typeof value[field] === 'string' && value[field].trim() !== ''))
    .withMessage('Se requiere al menos un criterio de busqueda: cliente, telefono o fecha.'),
  handleValidationErrors,
];

// HU-004 (Alison): status es OBLIGATORIO acá (a diferencia de
// listBookingsRules donde es opcional), porque el propósito mismo del
// endpoint es filtrar por estado.
const filterBookingsRules = [
  query('status')
    .exists({ checkFalsy: true }).withMessage('Debe indicar el estado a filtrar.')
    .isIn(BOOKING_STATUSES).withMessage('status no corresponde a un estado de reserva valido.'),
  query('date').optional().isDate({ format: 'YYYY-MM-DD', strictMode: true })
    .withMessage('date debe ser una fecha valida con formato yyyy-mm-dd.'),
  query('page').optional().isInt({ min: 1 }).withMessage('page debe ser un entero mayor o igual a 1.'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize debe ser un entero entre 1 y 100.'),
  handleValidationErrors,
];

// HU-006 (Alison): cancelar una reserva.
const cancelBookingRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un numero entero positivo.'),
  body('reason')
    .exists({ checkFalsy: true }).withMessage('El motivo de cancelación es obligatorio.')
    .bail()
    .isString().trim().isLength({ min: 1, max: 250 })
    .withMessage('El motivo de cancelación debe tener entre 1 y 250 caracteres.'),
  body('role').optional().isIn(['Administrador', 'Recepcionista']).withMessage('role no es valido.'),
  body('authorizedByUserId').optional().isInt({ min: 1 }).withMessage('authorizedByUserId debe ser un numero entero positivo.'),
  handleValidationErrors,
];

const updateBookingRules = [
  param('bookingId').isInt({ min: 1 }).withMessage('bookingId debe ser un numero entero positivo.'),
  body().custom((value) => value && !Array.isArray(value) && typeof value === 'object' &&
    Object.keys(value).length > 0 && Object.keys(value).every((key) => ['startDatetime', 'endDatetime'].includes(key)))
    .withMessage('Indique fecha de inicio o fin. Solo se permiten startDatetime y endDatetime.'),
  ...['startDatetime', 'endDatetime'].map((field) => body(field).optional()
    .isString().bail().isISO8601({ strict: true, strictSeparator: true }).bail()
    .custom((value) => /T\d{2}:\d{2}/.test(value) && Number.isFinite(new Date(value).getTime()))
    .withMessage('Debe indicar una fecha y hora ISO 8601 valida.')),
  handleValidationErrors,
];

module.exports = {
  updateBookingRules,
  createBookingRules,
  listBookingsRules,
  searchBookingsRules,
  filterBookingsRules,
  cancelBookingRules,
  handleValidationErrors,
};