'use strict';

const express = require('express');
const { query } = require('express-validator');
const { handleValidationErrors } = require('./catalogoMesas.validator');
const controller = require('./catalogoProductos.controller');
const router = express.Router();

router.get('/', [
  query('q').optional().isString().withMessage('La búsqueda debe ser texto.').bail()
    .trim().isLength({ max: 100 }).withMessage('La búsqueda admite hasta 100 caracteres.'),
  handleValidationErrors,
], controller.listProducts);

module.exports = router;
