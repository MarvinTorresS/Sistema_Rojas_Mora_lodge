'use strict';

// Router del catalogo de mesas, montado en app.js bajo /api/restaurant-tables.
// Sprint 4: HU-103 y HU-106 (Alison). Las demas historias del catalogo
// (HU-102 registrar, HU-104 buscar, HU-105 eliminar, HU-107 reactivar)
// agregan SUS lineas aqui sin tocar las de los demas.
const express = require('express');
const controller = require('./catalogoMesas.controller');
const { deactivateTableRules } = require('./catalogoMesas.validator');

const router = express.Router();

// HU-103 (Alison) - Listado de mesas, ordenado por numero ascendente.
router.get('/', controller.listTables);

// HU-106 (Alison) - Desactivar una mesa. Body: { confirmed: true }.
router.post('/:tableId/deactivate', deactivateTableRules, controller.deactivateTable);

module.exports = router;
