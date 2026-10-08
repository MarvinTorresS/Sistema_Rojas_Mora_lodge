'use strict';

// Validadores de FORMA para las reservas de cabinas (HU-016 en Sprint 3
// -- Marvin). Igual que en cancha y salon: aqui solo se revisa que el
// dato venga y tenga el formato correcto; las reglas de NEGOCIO
// (disponibilidad, capacidad, huesped duplicado) son del service.
const { body, query, validationResult } = require('express-validator');

// Fabrica de manejadores de errores de validacion. Todos responden 422 con
// el mismo formato ({ error: { message, details: [{ field, message }] } });
// lo unico que cambia entre un caso de uso y otro es el MENSAJE general.
//  - HU-016 y HU-127 usan un texto fijo sobre "la reserva".
//  - HU-128 (tarifas) necesita que el mensaje general sea el de su criterio
//    de aceptacion, asi que pasa una funcion que lo arma desde los errores.
// Se creo la fabrica en vez de copiar el manejador una vez mas: es la misma
// duplicacion que ya se anoto en cancha y salon, y aqui se evita.
function buildValidationErrorsHandler(buildMessage) {
  return function validationErrorsHandler(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
      const message = typeof buildMessage === 'function' ? buildMessage(details) : buildMessage;
      return res.status(422).json({ error: { message, details } });
    }
    return next();
  };
}

const handleValidationErrors = buildValidationErrorsHandler(
  'Datos de la reserva incompletos o con formato invalido.',
);

// Solo fecha, sin hora ("2026-10-12"). Una estadia en cabina se
// reserva por NOCHES: la hora de entrada y de salida es una politica
// del hotel (ver CHECK_IN_TIME / CHECK_OUT_TIME en el service), no algo
// que el recepcionista digite en cada reserva.
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// `location` es body o query de express-validator: la misma regla sirve
// para el POST (fechas en el cuerpo) y para el GET de disponibilidad
// (fechas en la URL) sin duplicarla.
function dateOnlyRule(location, field, requiredMessage) {
  return location(field)
    .exists({ checkFalsy: true }).withMessage(requiredMessage).bail()
    .isString().bail()
    .matches(DATE_ONLY_PATTERN).withMessage(`${field} debe tener el formato AAAA-MM-DD.`).bail()
    .isISO8601({ strict: true }).withMessage(`${field} no es una fecha valida.`);
}

function optionalDateOnlyRule(location, field) {
  return location(field)
    .optional()
    .isString().bail()
    .matches(DATE_ONLY_PATTERN).withMessage(`${field} debe tener el formato AAAA-MM-DD.`).bail()
    .isISO8601({ strict: true }).withMessage(`${field} no es una fecha valida.`);
}

// HU-016 (POST /api/cabin-bookings): registrar una reserva de cabina.
// Los campos son exactamente los que lista la HU: nombre completo,
// identificacion, telefono, correo, fecha entrada/salida y # de
// acompanantes.
//
// Cada regla usa .bail(): si la primera falla ("es obligatorio"), no se
// evaluan las siguientes. Asi un campo faltante produce UN mensaje y no
// tres redundantes (ese era el hallazgo abierto de los otros validators).
const createCabinBookingRules = [
  body('resourceId')
    .exists({ checkFalsy: true }).withMessage('Debe indicar la cabina (resourceId).').bail()
    .isInt({ min: 1 }).withMessage('resourceId debe ser un numero entero positivo.'),

  body('guestName')
    .exists({ checkFalsy: true }).withMessage('El nombre completo del huesped es obligatorio.').bail()
    .isString().bail().trim()
    .isLength({ min: 3, max: 150 }).withMessage('El nombre del huesped debe tener entre 3 y 150 caracteres.'),

  body('guestIdentification')
    .exists({ checkFalsy: true }).withMessage('La identificacion del huesped es obligatoria.').bail()
    .isString().bail().trim()
    .isLength({ min: 5, max: 30 }).withMessage('La identificacion debe tener entre 5 y 30 caracteres.'),

  body('guestPhone')
    .exists({ checkFalsy: true }).withMessage('El telefono del huesped es obligatorio.').bail()
    .isString().bail().trim()
    .isLength({ min: 8, max: 20 }).withMessage('El telefono del huesped no es valido.'),

  body('guestEmail')
    .exists({ checkFalsy: true }).withMessage('El correo del huesped es obligatorio.').bail()
    .isString().bail().trim()
    .isEmail().withMessage('El correo del huesped no tiene un formato valido.').bail()
    .isLength({ max: 150 }).withMessage('El correo no puede superar 150 caracteres.'),

  dateOnlyRule(body, 'checkInDate', 'La fecha de entrada es obligatoria.'),
  dateOnlyRule(body, 'checkOutDate', 'La fecha de salida es obligatoria.'),

  // 0 es un valor valido (huesped viaja solo), por eso NO se usa
  // checkFalsy aqui: con checkFalsy el 0 se contaria como "faltante".
  body('companions')
    .exists({ checkNull: true }).withMessage('Debe indicar el numero de acompanantes (0 si viaja solo).').bail()
    .isInt({ min: 0, max: 50 }).withMessage('companions debe ser un entero entre 0 y 50.'),

  // Opcional: solo lo manda el frontend en el segundo paso de CA-3,
  // cuando el recepcionista confirma "vincular al huesped existente".
  body('linkExistingGuest')
    .optional()
    .isBoolean().withMessage('linkExistingGuest debe ser verdadero o falso.'),

  handleValidationErrors,
];

// GET /api/cabin-bookings/availability: disponibilidad de TODAS las
// cabinas para una estadia y un grupo (pantalla de HU-016). agendaFrom y
// agendaTo son opcionales: definen la "tira de noches" que pinta cada
// tarjeta; si no vienen, el service usa la misma estadia.
const cabinAvailabilityRules = [
  dateOnlyRule(query, 'checkInDate', 'La fecha de entrada es obligatoria.'),
  dateOnlyRule(query, 'checkOutDate', 'La fecha de salida es obligatoria.'),
  query('partySize')
    .exists({ checkFalsy: true }).withMessage('Debe indicar cuantas personas se hospedan (partySize).').bail()
    .isInt({ min: 1, max: 51 }).withMessage('partySize debe ser un entero entre 1 y 51.'),
  optionalDateOnlyRule(query, 'agendaFrom'),
  optionalDateOnlyRule(query, 'agendaTo'),
  handleValidationErrors,
];

module.exports = {
  cabinAvailabilityRules,
  createCabinBookingRules,
  // Piezas reutilizadas por cabinExtension.validator.js (HU-127) y
  // cabinRate.validator.js (HU-128), para no duplicar el formato de fecha
  // ni el manejo de errores.
  handleValidationErrors,
  buildValidationErrorsHandler,
  dateOnlyRule,
};
