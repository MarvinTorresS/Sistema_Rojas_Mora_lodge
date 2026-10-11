'use strict';

// Validador de FORMA de la busqueda de reservas por huesped (HU-018 --
// Sprint 3). Reusa el manejo de errores del validator de HU-016
// para que todo el modulo responda con el mismo formato.
const { query } = require('express-validator');
const { buildValidationErrorsHandler } = require('./reservasCabina.validator');
const {
  MAX_SEARCH_LENGTH, MAX_PAGE_SIZE, EMPTY_SEARCH_MESSAGE, normalizeSearchTerm,
} = require('./cabinSearch.util');

// El mensaje general es el del primer problema (el mismo que ve el usuario
// junto al campo de busqueda).
const searchErrorsHandler = buildValidationErrorsHandler((details) => details[0].message);

const searchCabinBookingsRules = [
  // CA-1 parte de "se ingreso un criterio de busqueda": sin criterio no hay
  // busqueda. Se revisa el texto YA limpio, asi "   " cuenta como vacio.
  query('q').custom((value) => {
    const term = normalizeSearchTerm(value);
    if (!term) throw new Error(EMPTY_SEARCH_MESSAGE);
    if (term.length > MAX_SEARCH_LENGTH) {
      throw new Error(`El criterio de búsqueda no puede superar ${MAX_SEARCH_LENGTH} caracteres.`);
    }
    return true;
  }),
  query('page').optional()
    .isInt({ min: 1, max: 1000000 }).withMessage('page debe ser un entero positivo.'),
  query('pageSize').optional()
    .isInt({ min: 1, max: MAX_PAGE_SIZE }).withMessage(`pageSize debe estar entre 1 y ${MAX_PAGE_SIZE}.`),
  searchErrorsHandler,
];

module.exports = { searchCabinBookingsRules };
