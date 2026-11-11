'use strict';

const { param, body, validationResult } = require('express-validator');

// Mismo formato de error 422 que el resto de modulos:
// { error: { message, details: [{ field, message }] } }.
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return res.status(422).json({ error: { message: details[0].message, details } });
  }
  return next();
}

const deactivateTableRules = [
  param('tableId').isInt({ min: 1 }).withMessage('El identificador de la mesa debe ser un entero positivo.'),
  body('confirmed')
    .custom((value) => value === true)
    .withMessage('Debe confirmar la desactivación de la mesa.'),
  handleValidationErrors,
];

const deleteTableRules = [
  param('tableId').isInt({ min: 1 }).withMessage('El identificador de la mesa debe ser un entero positivo.'),
  body('confirmed').custom((value) => value === true).withMessage('Debe confirmar la eliminación permanente.'),
  body('adminApproval.email').isString().bail().trim().isEmail().isLength({ max: 150 })
    .withMessage('Indique el correo del Administrador.'),
  body('adminApproval.password').custom((value) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Indique una contraseña válida.'),
  // No devolver credenciales en los detalles de validación.
  handleValidationErrors,
];

module.exports = { handleValidationErrors, deactivateTableRules, deleteTableRules };
