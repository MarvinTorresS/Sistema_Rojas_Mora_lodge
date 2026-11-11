'use strict';

const express = require('express');
const { query } = require('express-validator');
const { handleValidationErrors } = require('./catalogoMesas.validator');
const { createProductRules } = require('./catalogoProductos.validator');
const controller = require('./catalogoProductos.controller');
const router = express.Router();

router.get('/', [
  query('q').optional().isString().withMessage('La búsqueda debe ser texto.').bail()
    .trim().isLength({ max: 100 }).withMessage('La búsqueda admite hasta 100 caracteres.'),
  handleValidationErrors,
], controller.listProducts);

// HU-113 (Marvin) - Categorias oficiales del menu. Ruta fija: va antes de
// cualquier /:productId que se agregue despues.
router.get('/categories', controller.listCategories);

// HU-113 (Marvin) - Registrar un producto.
// Body: { name, category, price, stockQuantity?, userId? }.
router.post('/', createProductRules, controller.createProduct);

module.exports = router;
