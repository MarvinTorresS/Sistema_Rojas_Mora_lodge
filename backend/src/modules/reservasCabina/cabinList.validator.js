'use strict';
const { query } = require('express-validator');
const { buildValidationErrorsHandler } = require('./reservasCabina.validator');
const { MAX_PAGE_SIZE } = require('./cabinSearch.util');

const listCabinBookingsRules = [
  query('page').optional().isInt({ min: 1, max: 1000000 })
    .withMessage('page debe ser un entero positivo.'),
  query('pageSize').optional().isInt({ min: 1, max: MAX_PAGE_SIZE })
    .withMessage(`pageSize debe estar entre 1 y ${MAX_PAGE_SIZE}.`),
  buildValidationErrorsHandler((details) => details[0].message),
];
module.exports = { listCabinBookingsRules };
