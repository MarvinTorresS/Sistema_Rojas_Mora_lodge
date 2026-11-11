'use strict';

// Validaciones HTTP del catalogo de productos - Sprint 4 (Marvin): HU-113.
// El service vuelve a aplicar la forma definitiva (normalizacion y reglas);
// aqui se rechaza temprano lo que no tiene sentido. Las reglas puras viven
// en restaurante.util para que validator y service no se contradigan.
const { body } = require('express-validator');
const { handleRequiredFieldErrors, requiredMessage } = require('./catalogoMesas.validator');
const {
  PRODUCT_CATEGORIES, PRODUCT_NAME_MAX_LENGTH,
  normalizeProductName, resolveProductCategory, isValidPrice, parseStock,
} = require('./restaurante.util');

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const categoryList = PRODUCT_CATEGORIES.map((category) => category.label).join(', ');

// HU-113 - POST /api/restaurant-products
const createProductRules = [
  body('name').custom((value) => !isBlank(value))
    .withMessage(requiredMessage('El nombre del producto es obligatorio.')).bail()
    .isString().withMessage('El nombre debe ser texto.').bail()
    .custom((value) => normalizeProductName(value).length <= PRODUCT_NAME_MAX_LENGTH)
    .withMessage(`El nombre admite hasta ${PRODUCT_NAME_MAX_LENGTH} caracteres.`),
  body('category').custom((value) => !isBlank(value))
    .withMessage(requiredMessage('La categoría es obligatoria.')).bail()
    .custom((value) => resolveProductCategory(value) !== null)
    .withMessage(`Seleccione una categoría válida: ${categoryList}.`),
  body('price').custom((value) => !isBlank(value))
    .withMessage(requiredMessage('El precio es obligatorio.')).bail()
    .custom(isValidPrice)
    .withMessage('El precio debe ser mayor que 0, hasta 99 999 999.99 y con máximo 2 decimales.'),
  body('stockQuantity').optional({ values: 'null' }).custom((value) => parseStock(value) !== null)
    .withMessage('Las existencias iniciales deben ser un número entero mayor o igual a 0.'),
  body('userId').optional({ values: 'null' }).custom((value) => Number.isSafeInteger(value) && value >= 1)
    .withMessage('El usuario debe ser un entero positivo.'),
  handleRequiredFieldErrors,
];

module.exports = { createProductRules };
