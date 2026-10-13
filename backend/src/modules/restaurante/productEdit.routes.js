'use strict';
const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const controller = require('./productEdit.controller');
const { buildValidationErrorsHandler } = require('../reservasCabina/reservasCabina.validator');
const idRules = [param('productId').isInt({ min: 1, max: 2147483647 }).withMessage('El número de producto debe ser un entero positivo.'), buildValidationErrorsHandler((details) => details[0].message)];
function editErrors(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const details = errors.array().map((error) => ({ field: error.path, message: error.msg }));
  const missing = ['name', 'category', 'price'].some((field) => req.body[field] == null || String(req.body[field]).trim() === '');
  return res.status(422).json({ error: { message: missing ? 'Los campos marcados con (*) son obligatorios' : details[0].message, details } });
}
// Restriccion a Administrador pendiente de la autenticacion del Sprint 5.
router.get('/:productId', idRules, controller.get);
router.put('/:productId', idRules,
  body('name').isString().bail().trim().isLength({ min: 1, max: 100 }).withMessage('El nombre debe tener entre 1 y 100 caracteres.'),
  body('category').isString().bail().trim().isLength({ min: 1, max: 60 }).withMessage('La categoría debe tener entre 1 y 60 caracteres.'),
  body('price').custom((value) => {
    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(String(value)) || Number(value) <= 0) throw new Error('El precio debe ser positivo, con un máximo de dos decimales.');
    return true;
  }),
  body('stockQuantity').isInt({ min: 0, max: 2147483647 }).withMessage('Las existencias deben ser un entero mayor o igual a cero.'),
  editErrors, controller.update);
module.exports = router;
