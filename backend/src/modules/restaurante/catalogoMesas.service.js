'use strict';

// Catalogo de mesas del restaurante - Sprint 4 (Alison):
//   HU-103  Consultar el listado de mesas.
//   HU-106  Desactivar una mesa.
//
// Esta capa no sabe nada de HTTP: recibe datos ya validados en su forma y
// lanza DomainError (con statusCode y code) cuando una regla de NEGOCIO
// falla. Mismo patron que reservasCancha.service.js.
const { RestaurantTable, RestaurantAccount, Resource, Booking, ResourceBlock,
  CabinDetail, EventHallPricingPlan, FieldRate, AuditLog, sequelize } = require('../../models');
const { verifyTableAdministrator } = require('./tableAdminApproval.service');
const { DomainError } = require('../../utils/domainError.util');
const {
  MESSAGES, CODES, compareTableNumbers, mapTable,
} = require('./restaurante.util');

// ---------------------------------------------------------------------
// HU-103 - Consultar el listado de mesas.
//   CA-1: muestra numero, capacidad, ubicacion y estado (Activa/Inactiva),
//         ordenado por numero ascendente.
//   CA-2: sin mesas -> items = [] y total = 0 (NO es un error); el frontend
//         muestra "No hay mesas registradas actualmente" y el acceso a
//         "Registrar mesa".
// `capacidad total instalada` (razon de la HU) = suma de los comensales de
// las mesas ACTIVAS: una mesa retirada de servicio ya no es capacidad.
// ---------------------------------------------------------------------
async function listTables() {
  const rows = await RestaurantTable.findAll();
  const items = rows.map(mapTable).sort((a, b) => compareTableNumbers(a.tableNumber, b.tableNumber));
  const active = items.filter((table) => table.isActive);
  return {
    items,
    total: items.length,
    activeTotal: active.length,
    inactiveTotal: items.length - active.length,
    totalCapacity: active.reduce((sum, table) => sum + Number(table.seatCount || 0), 0),
  };
}

// Resource antes de RestaurantTable: mismo orden que los flujos de reservas.
// Las lecturas bloqueantes son actuales aunque MySQL use REPEATABLE READ.
async function lockTableResource(tableId, transaction) {
  const hint = await RestaurantTable.findByPk(tableId, { transaction });
  if (!hint) throw new DomainError(MESSAGES.TABLE_NOT_FOUND, 404);
  const resource = await Resource.findByPk(hint.resourceId, { transaction, lock: transaction.LOCK.UPDATE });
  const table = await RestaurantTable.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!table) throw new DomainError(MESSAGES.TABLE_NOT_FOUND, 404);
  if (!resource || resource.resourceType !== 'restaurant_table' || table.resourceId !== resource.resourceId) {
    throw new DomainError('La mesa no tiene un recurso de tipo restaurant_table válido.', 409, { code: 'TABLE_RESOURCE_INVALID' });
  }
  return { table, resource };
}

function tableHistoryError(tableId) {
  return new DomainError('No se puede eliminar la mesa porque tiene historial o registros asociados. Puede solicitar su desactivación.', 409, {
    code: 'TABLE_HAS_HISTORY', details: { tableId, alternative: 'deactivate' },
  });
}

async function deleteTable(tableId, { confirmed, adminApproval } = {}) {
  if (!Number.isSafeInteger(tableId) || tableId < 1 || confirmed !== true) {
    throw new DomainError('Indique una mesa válida y confirme su eliminación permanente.', 422);
  }
  // La identidad de auditoría procede de credenciales verificadas, nunca del body.userId.
  const userId = await verifyTableAdministrator(adminApproval);
  try {
    return await sequelize.transaction(async (transaction) => {
      const { table, resource } = await lockTableResource(tableId, transaction);
      const account = await RestaurantAccount.findOne({ where: { tableId }, transaction, lock: transaction.LOCK.UPDATE });
      if (account) throw tableHistoryError(tableId);
      for (const model of [Booking, ResourceBlock, CabinDetail, EventHallPricingPlan, FieldRate]) {
        const reference = await model.findOne({ where: { resourceId: resource.resourceId }, transaction, lock: transaction.LOCK.UPDATE });
        if (reference) throw tableHistoryError(tableId);
      }
      const snapshot = { tableId, resourceId: resource.resourceId, tableNumber: table.tableNumber, seatCount: table.seatCount };
      await table.destroy({ transaction });
      await resource.destroy({ transaction });
      await AuditLog.create({
        userId, action: 'restaurant_table_deleted', entityType: 'restaurant_table', entityId: tableId,
        details: JSON.stringify(snapshot),
      }, { transaction });
      return snapshot;
    });
  } catch (error) {
    // Incluye referencias nuevas/no previstas; el rollback ocurre ANTES del 409.
    if (error.name === 'SequelizeForeignKeyConstraintError') throw tableHistoryError(tableId);
    throw error;
  }
}

// ---------------------------------------------------------------------
// HU-106 - Desactivar una mesa.
//   CA-1: mesa activa y sin cuenta abierta + confirmacion -> estado
//         "Inactiva" (sale del panel de asignacion). La confirmacion
//         ("¿Esta seguro...?") se pide en pantalla y TAMBIEN se exige aqui
//         (`confirmed: true`): una llamada directa a la API no la salta.
//   CA-2: mesa con cuenta abierta -> 409, no cambia nada.
//   CA-3: mesa ya inactiva -> 409, no cambia nada.
// Todo en una transaccion con la mesa bloqueada: si otro mesero abre una
// cuenta en ese mismo instante, o se procesa primero la apertura (y aqui se
// rechaza) o se procesa primero la desactivacion.
// ---------------------------------------------------------------------
async function deactivateTable(tableId, { confirmed, userId = null } = {}) {
  if (confirmed !== true) {
    throw new DomainError(MESSAGES.TABLE_DEACTIVATION_NOT_CONFIRMED, 422, {
      details: [{ field: 'confirmed', message: MESSAGES.TABLE_DEACTIVATION_NOT_CONFIRMED }],
    });
  }

  return sequelize.transaction(async (transaction) => {
    const { table, resource } = await lockTableResource(tableId, transaction);

    // CA-3
    if (table.status === 'inactive') {
      throw new DomainError(MESSAGES.TABLE_ALREADY_INACTIVE, 409, { code: CODES.TABLE_ALREADY_INACTIVE });
    }

    // CA-2: la fuente de verdad es la tabla de cuentas, no el campo status
    // de la mesa (una cuenta abierta puede existir aunque el status no se
    // haya sincronizado todavia).
    const openAccount = await RestaurantAccount.findOne({
      where: { tableId: table.tableId, status: 'open' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (openAccount) {
      throw new DomainError(MESSAGES.TABLE_HAS_OPEN_ACCOUNT, 409, {
        code: CODES.TABLE_HAS_OPEN_ACCOUNT,
        details: { tableId: table.tableId, accountId: openAccount.accountId },
      });
    }

    const previousStatus = table.status;
    await table.update({ status: 'inactive' }, { transaction });
    await resource.update({ status: 'inactive' }, { transaction });
    await AuditLog.create({
      userId,
      action: 'restaurant_table_deactivated',
      entityType: 'restaurant_table',
      entityId: table.tableId,
      details: JSON.stringify({ tableNumber: table.tableNumber, previousStatus, newStatus: 'inactive' }),
    }, { transaction });

    return mapTable(table);
  });
}

module.exports = { listTables, deactivateTable, deleteTable };
