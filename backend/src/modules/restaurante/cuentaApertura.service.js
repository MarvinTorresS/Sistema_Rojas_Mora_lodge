'use strict';

// Apertura de la cuenta de una mesa - Sprint 4 (Marvin):
//   HU-024  Abrir una cuenta al asignar una mesa (Mesero o Administrador).
//
//   CA-1  Mesa disponible -> se crea la cuenta (mesero responsable y hora de
//         apertura) y la mesa pasa a "Ocupada".
//   CA-2  Dos meseros a la vez -> se crea UNA sola cuenta; el segundo recibe
//         "Esta mesa ya fue abierta".
//   CA-3  Mesa ya ocupada -> "La mesa ya se encuentra ocupada"; no continua y
//         se ofrece unir el pedido a la cuenta abierta (details.accountId).
//
// Concurrencia: todo ocurre en una transaccion con la fila de la mesa
// bloqueada (SELECT ... FOR UPDATE). El segundo mesero espera a que el
// primero confirme y, al obtener el bloqueo, ya ve su cuenta: nunca se
// crean dos. La fuente de verdad es "existe una cuenta open para la mesa",
// no solo restaurant_tables.status.
//
// CA-2 vs CA-3: el frontend envia `seenTableStatus`, el estado que el mesero
// veia en pantalla. Si veia la mesa "available" y al bloquearla ya tiene
// cuenta, otro mesero se le adelanto (CA-2). Si ya la veia "occupied" (o no
// lo envia), es CA-3.
//
// Nota para el equipo: consumoHuesped.service.js (HU-030) abre una cuenta
// con reglas parecidas dentro de registerGuestConsumption. Se propone que
// HU-030 reutilice openTableAccount en un refactor acordado; no se cambio
// aqui para no alterar esa historia.
const { RestaurantTable, RestaurantAccount, AuditLog, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { MESSAGES, CODES, mapTable } = require('./restaurante.util');
const { buildAccountDetail } = require('./cuentaPedido.service');
const { assertActingUser } = require('./usuarioResponsable.service');

const SEEN_STATUSES = ['available', 'occupied'];

function validateInput({ tableId, seenTableStatus }) {
  if (!Number.isSafeInteger(tableId) || tableId < 1) {
    throw new DomainError('Seleccione una mesa válida.', 422, {
      details: [{ field: 'tableId', message: 'Seleccione una mesa válida.' }],
    });
  }
  if (seenTableStatus !== undefined && seenTableStatus !== null && !SEEN_STATUSES.includes(seenTableStatus)) {
    throw new DomainError('El estado visto de la mesa no es válido.', 422, {
      details: [{ field: 'seenTableStatus', message: `Use uno de: ${SEEN_STATUSES.join(', ')}.` }],
    });
  }
}

async function openTableAccount({ tableId, seenTableStatus, userId } = {}) {
  validateInput({ tableId, seenTableStatus });

  return sequelize.transaction(async (transaction) => {
    const openedByUserId = await assertActingUser(userId, { transaction, required: true });

    const table = await RestaurantTable.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!table) throw new DomainError(MESSAGES.TABLE_NOT_FOUND, 404);
    if (table.status === 'inactive') {
      throw new DomainError(MESSAGES.TABLE_INACTIVE, 409, {
        code: CODES.TABLE_INACTIVE, details: { tableId },
      });
    }

    const openAccount = await RestaurantAccount.findOne({
      where: { tableId, status: 'open' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (openAccount) {
      const raced = seenTableStatus === 'available';
      throw new DomainError(raced ? MESSAGES.TABLE_ALREADY_OPENED : MESSAGES.TABLE_OCCUPIED, 409, {
        code: raced ? CODES.TABLE_ALREADY_OPENED : CODES.TABLE_OCCUPIED,
        details: { tableId, accountId: openAccount.accountId },
      });
    }

    // CA-1
    const previousStatus = table.status;
    const account = await RestaurantAccount.create({
      tableId,
      openedByUserId,
      status: 'open',
      openedAt: new Date(),
    }, { transaction });
    await table.update({ status: 'occupied' }, { transaction });
    await AuditLog.create({
      userId: openedByUserId,
      action: 'restaurant_account_opened',
      entityType: 'restaurant_account',
      entityId: account.accountId,
      details: JSON.stringify({
        tableId, tableNumber: table.tableNumber, previousStatus, seenTableStatus: seenTableStatus ?? null,
      }),
    }, { transaction });

    return {
      account: await buildAccountDetail(account, { transaction }),
      table: mapTable(table),
    };
  });
}

module.exports = { openTableAccount };
