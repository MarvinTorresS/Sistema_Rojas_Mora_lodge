'use strict';

const service = require('./catalogoMesas.service');
const { MESSAGES } = require('./restaurante.util');

// TODO (Sprint 5, autenticacion): el usuario debe salir de req.user. Hasta
// entonces se acepta `userId` del cuerpo solo para dejarlo en la auditoria
// (misma salida temporal que `role` en la cancelacion de cancha, HU-006).
function actingUserId(req) {
  return req.user?.userId ?? (Number.isInteger(req.body?.userId) ? req.body.userId : null);
}

// HU-103 + HU-104: sin parametros devuelve el catalogo completo (HU-103);
// con ?number= y/o ?minSeats= filtra (HU-104).
async function listTables(req, res, next) {
  try {
    const { items, ...meta } = await service.listTables({ number: req.query.number, minSeats: req.query.minSeats });
    return res.json({ data: items, meta });
  } catch (error) {
    return next(error);
  }
}

async function deactivateTable(req, res, next) {
  try {
    const data = await service.deactivateTable(Number(req.params.tableId), {
      confirmed: req.body?.confirmed,
      userId: actingUserId(req),
    });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

async function deleteTable(req, res, next) {
  try {
    const data = await service.deleteTable(Number(req.params.tableId), {
      confirmed: req.body?.confirmed, adminApproval: req.body?.adminApproval,
    });
    return res.json({ data });
  } catch (error) { return next(error); }
}

// HU-102 (Marvin) - Registrar una nueva mesa.
async function createTable(req, res, next) {
  try {
    const { tableNumber, seatCount, location } = req.body;
    const data = await service.createTable({
      tableNumber, seatCount, location, userId: actingUserId(req),
    });
    return res.status(201).json({ data, message: MESSAGES.TABLE_CREATED });
  } catch (error) { return next(error); }
}

module.exports = {
  listTables, deactivateTable, deleteTable, createTable, actingUserId,
};
