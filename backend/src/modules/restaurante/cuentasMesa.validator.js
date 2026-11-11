'use strict';

const { param, query, body } = require('express-validator');
const { handleValidationErrors } = require('./catalogoMesas.validator');
const { MAX_QUANTITY_PER_LINE, MAX_ITEMS_PER_REQUEST } = require('./restaurante.util');

const itemRules = [
  body('items').isArray({ min: 1, max: MAX_ITEMS_PER_REQUEST })
    .withMessage(`Agregue entre 1 y ${MAX_ITEMS_PER_REQUEST} productos al pedido.`),
  body('items.*.productId').isInt({ min: 1 }).withMessage('Cada producto debe tener un identificador válido.'),
  body('items.*.quantity').isInt({ min: 1, max: MAX_QUANTITY_PER_LINE })
    .withMessage(`La cantidad debe ser un entero entre 1 y ${MAX_QUANTITY_PER_LINE}.`),
];

// HU-025
const addItemsRules = [
  param('accountId').isInt({ min: 1 }).withMessage('El identificador de la cuenta debe ser un entero positivo.'),
  ...itemRules,
  handleValidationErrors,
];

const accountIdRules = [
  param('accountId').isInt({ min: 1 }).withMessage('El identificador de la cuenta debe ser un entero positivo.'),
  handleValidationErrors,
];

const updateItemQuantityRules = [
  param('accountId').isInt({ min: 1 }).withMessage('El identificador de la cuenta debe ser un entero positivo.'),
  param('itemId').isInt({ min: 1 }).withMessage('El identificador de la línea debe ser un entero positivo.'),
  body().custom((value) => value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => ['quantity', 'expectedVersion', 'userId'].includes(key)))
    .withMessage('Envíe un objeto con cantidad, versión y, opcionalmente, usuario de auditoría; no se admiten otros campos.'),
  body('quantity').custom((value) => Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY_PER_LINE)
    .withMessage(`La cantidad debe ser un entero entre 1 y ${MAX_QUANTITY_PER_LINE}.`),
  body('expectedVersion').custom((value) => Number.isSafeInteger(value) && value >= 1)
    .withMessage('La versión esperada debe ser un entero positivo.'),
  body('userId').optional().custom((value) => Number.isSafeInteger(value) && value >= 1)
    .withMessage('El usuario debe ser un entero positivo.'),
  handleValidationErrors,
];

// HU-030: busqueda de huesped (numero de cabina o nombre de la reserva).
const searchGuestsRules = [
  query('q').exists({ checkFalsy: true }).withMessage('Indique el número de cabina o el nombre de la reserva.').bail()
    .isString().isLength({ min: 1, max: 100 }).withMessage('La búsqueda admite hasta 100 caracteres.'),
  handleValidationErrors,
];

// HU-030
const guestConsumptionRules = [
  body('bookingId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 })
    .withMessage('El identificador de la reserva debe ser un entero positivo.'),
  body('cabin').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('guestName').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('tableId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 })
    .withMessage('La mesa debe ser un entero positivo.'),
  body('userId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('El usuario debe ser un entero positivo.'),
  ...itemRules,
  handleValidationErrors,
];

// HU-031
const guestBalanceRules = [
  query('bookingId').exists({ checkFalsy: true }).withMessage('Indique la reserva del huésped.').bail()
    .isInt({ min: 1 }).withMessage('El identificador de la reserva debe ser un entero positivo.'),
  handleValidationErrors,
];

// HU-024 (Marvin) - Abrir la cuenta de una mesa.
// seenTableStatus: estado que el mesero veia en pantalla (distingue CA-2 de
// CA-3). userId: temporal hasta la autenticacion del Sprint 5.
const openAccountRules = [
  body('tableId').exists({ values: 'null' }).withMessage('Seleccione la mesa.').bail()
    .custom((value) => Number.isSafeInteger(value) && value >= 1)
    .withMessage('Seleccione una mesa válida.'),
  body('seenTableStatus').optional({ values: 'null' }).isIn(['available', 'occupied'])
    .withMessage('El estado visto de la mesa debe ser available u occupied.'),
  body('userId').exists({ values: 'null' }).withMessage('No se pudo identificar al usuario que realiza la operación.').bail()
    .custom((value) => Number.isSafeInteger(value) && value >= 1)
    .withMessage('El usuario debe ser un entero positivo.'),
  handleValidationErrors,
];

module.exports = {
  openAccountRules,
  updateItemQuantityRules,
  addItemsRules, accountIdRules, searchGuestsRules, guestConsumptionRules, guestBalanceRules,
};
