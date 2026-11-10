'use strict';

const service = require('./catalogoMesas.service');

// TODO (Sprint 5, autenticacion): el usuario debe salir de req.user. Hasta
// entonces se acepta `userId` del cuerpo solo para dejarlo en la auditoria
// (misma salida temporal que `role` en la cancelacion de cancha, HU-006).
function actingUserId(req) {
  return req.user?.userId ?? (Number.isInteger(req.body?.userId) ? req.body.userId : null);
}

async function listTables(req, res, next) {
  try {
    const { items, ...meta } = await service.listTables();
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

module.exports = { listTables, deactivateTable, actingUserId };
