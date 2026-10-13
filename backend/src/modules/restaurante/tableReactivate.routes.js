'use strict';
const router = require('express').Router();
const { param } = require('express-validator');
const { buildValidationErrorsHandler } = require('../reservasCabina/reservasCabina.validator');
const { reactivate } = require('./tableReactivate.controller');
// Restringir a Administrador cuando exista autenticacion del Sprint 5.
router.post('/:tableId/reactivate',
  param('tableId').isInt({ min: 1, max: 2147483647 }).withMessage('El identificador de mesa debe ser un entero positivo.'),
  buildValidationErrorsHandler((details) => details[0].message), reactivate);
module.exports = router;
