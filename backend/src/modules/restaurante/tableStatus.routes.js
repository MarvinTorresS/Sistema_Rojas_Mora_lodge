'use strict';
const router = require('express').Router();
const { list } = require('./tableStatus.controller');
// Acceso para Mesero/Administrador pendiente de autenticacion del Sprint 5.
router.get('/status', list);
module.exports = router;
