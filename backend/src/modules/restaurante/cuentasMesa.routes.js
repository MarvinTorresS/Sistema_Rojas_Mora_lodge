'use strict';

// Router de cuentas de mesa y consumos de huespedes, montado en app.js bajo
// /api/restaurant-accounts. Sprint 4 (Alison): HU-025, HU-030 y HU-031.
// HU-024 (abrir cuenta), HU-026/027 (modificar/eliminar lineas), HU-028
// (cerrar) y HU-029 (total con IVA) agregan SUS rutas aqui.
//
// Las rutas fijas (/menu, /guests, /guest-balance, /guest-consumption) van
// ANTES de /:accountId para que Express no las lea como un id.
const express = require('express');
const controller = require('./cuentasMesa.controller');
const {
  openAccountRules,
  updateItemQuantityRules,
  addItemsRules, accountIdRules, searchGuestsRules, guestConsumptionRules, guestBalanceRules,
} = require('./cuentasMesa.validator');

const router = express.Router();

// Catalogo de productos para tomar pedidos (Disponible / Agotado).
router.get('/menu', controller.listMenu);

// HU-030 (Alison) - Buscar al huesped por numero de cabina o nombre.
router.get('/guests', searchGuestsRules, controller.searchGuests);

// HU-031 (Alison) - Detalle y saldo acumulado de consumos de un huesped.
router.get('/guest-balance', guestBalanceRules, controller.getGuestBalance);

// HU-030 (Alison) - Registrar un consumo a nombre de un huesped de cabina.
router.post('/guest-consumption', guestConsumptionRules, controller.registerGuestConsumption);

// Cuentas abiertas (para elegir a cual agregar productos).
router.get('/', controller.listOpenAccounts);

// HU-024 (Marvin) - Abrir la cuenta de una mesa.
// Body: { tableId, seenTableStatus?, userId }.
router.post('/', openAccountRules, controller.openAccount);

router.get('/:accountId', accountIdRules, controller.getAccount);

// HU-025 (Alison) - Agregar productos al pedido de una cuenta activa.
router.post('/:accountId/items', addItemsRules, controller.addItems);

router.patch('/:accountId/items/:itemId', updateItemQuantityRules, controller.updateItemQuantity);

module.exports = router;
