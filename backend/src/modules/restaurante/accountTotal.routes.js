'use strict';
const router = require('express').Router();
const { param } = require('express-validator');
const { buildValidationErrorsHandler } = require('../reservasCabina/reservasCabina.validator');
const { getTotal } = require('./accountTotal.controller');
// Autorizacion para Mesero/Administrador pendiente del Sprint 5.
router.get('/:accountId/total',
  param('accountId').isInt({ min: 1, max: 2147483647 }).withMessage('El número de cuenta debe ser un entero positivo.'),
  buildValidationErrorsHandler((details) => details[0].message), getTotal);
module.exports = router;
