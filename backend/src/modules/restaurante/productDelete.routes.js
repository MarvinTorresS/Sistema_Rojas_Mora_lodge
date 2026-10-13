'use strict';
const router = require('express').Router();
const { param, body } = require('express-validator');
const { buildValidationErrorsHandler } = require('../reservasCabina/reservasCabina.validator');
const { remove } = require('./productDelete.controller');
// Restriccion a Administrador pendiente de autenticacion del Sprint 5.
router.delete('/:productId',
  param('productId').isInt({ min: 1, max: 2147483647 }).withMessage('El número de producto debe ser un entero positivo.'),
  body('confirmed').custom((value) => value === true).withMessage('Debe confirmar la eliminación permanente del producto.'),
  buildValidationErrorsHandler((details) => details[0].message), remove);
module.exports = router;
