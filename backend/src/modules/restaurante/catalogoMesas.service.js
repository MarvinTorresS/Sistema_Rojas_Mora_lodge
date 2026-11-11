'use strict';

// Catalogo de mesas del restaurante - Sprint 4 (Alison):
//   HU-103  Consultar el listado de mesas.
//   HU-106  Desactivar una mesa.
// Sprint 4 (Marvin):
//   HU-102  Registrar una nueva mesa.
//   HU-104  Buscar mesa por numero o capacidad (filtros de listTables).
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
  normalizeTableNumber, isValidTableNumber, MIN_SEATS, MAX_SEATS, TABLE_LOCATION_MAX_LENGTH,
} = require('./restaurante.util');
const { assertActingUser } = require('./usuarioResponsable.service');

const TABLE_NUMBER_FORMAT_MESSAGE = 'El número de mesa admite hasta 10 letras, dígitos o guiones.';
const SEAT_COUNT_MESSAGE = `La capacidad debe ser un número entero entre ${MIN_SEATS} y ${MAX_SEATS}.`;
const MIN_SEATS_MESSAGE = `La capacidad mínima debe ser un número entero entre ${MIN_SEATS} y ${MAX_SEATS}.`;
const LOCATION_MESSAGE = `La ubicación admite hasta ${TABLE_LOCATION_MAX_LENGTH} caracteres.`;

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

// Entero desde un numero o un texto de solo digitos (4 o "4"). null si no lo es.
function toInteger(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^\s*\d{1,6}\s*$/.test(value)) return Number(value);
  return null;
}

// HU-104: criterios de busqueda normalizados. Devuelve null si no llega
// ninguno, para que listTables responda exactamente como en HU-103.
function normalizeTableFilters({ number, minSeats } = {}) {
  const filters = {};
  const details = [];
  if (!isBlank(number)) {
    const normalized = normalizeTableNumber(number);
    if (isValidTableNumber(normalized)) filters.number = normalized;
    else details.push({ field: 'number', message: TABLE_NUMBER_FORMAT_MESSAGE });
  }
  if (!isBlank(minSeats)) {
    const seats = toInteger(minSeats);
    if (seats !== null && seats >= MIN_SEATS && seats <= MAX_SEATS) filters.minSeats = seats;
    else details.push({ field: 'minSeats', message: MIN_SEATS_MESSAGE });
  }
  if (details.length) throw new DomainError(details[0].message, 422, { details });
  return Object.keys(filters).length ? filters : null;
}

// ---------------------------------------------------------------------
// HU-103 - Consultar el listado de mesas.
//   CA-1: muestra numero, capacidad, ubicacion y estado (Activa/Inactiva),
//         ordenado por numero ascendente.
//   CA-2: sin mesas -> items = [] y total = 0 (NO es un error); el frontend
//         muestra "No hay mesas registradas actualmente" y el acceso a
//         "Registrar mesa".
// `capacidad total instalada` (razon de la HU) = suma de los comensales de
// las mesas ACTIVAS: una mesa retirada de servicio ya no es capacidad.
//
// HU-104 (Marvin) - Buscar mesa por numero o capacidad. Filtros opcionales
// y combinables:
//   number    numero exacto, con la normalizacion de HU-102 ("05" = "5").
//   minSeats  capacidad minima (seatCount >= minSeats).
//   CA-1: items = solo las mesas que coinciden (activas e inactivas).
//   CA-2: sin coincidencias -> items = [] (NO es un error); el frontend
//         muestra MESSAGES.TABLES_NOT_FOUND.
// Los totales se calculan sobre TODO el catalogo; con filtros se agregan
// `matchedTotal` y `filters` (eco normalizado). Sin filtros la respuesta es
// identica a la de HU-103.
// ---------------------------------------------------------------------
async function listTables(criteria = {}) {
  const filters = normalizeTableFilters(criteria);
  const rows = await RestaurantTable.findAll();
  const all = rows.map(mapTable).sort((a, b) => compareTableNumbers(a.tableNumber, b.tableNumber));
  const active = all.filter((table) => table.isActive);
  const summary = {
    total: all.length,
    activeTotal: active.length,
    inactiveTotal: all.length - active.length,
    totalCapacity: active.reduce((sum, table) => sum + Number(table.seatCount || 0), 0),
  };
  if (!filters) return { items: all, ...summary };

  const items = all.filter((table) => (
    (filters.number === undefined || normalizeTableNumber(table.tableNumber) === filters.number)
    && (filters.minSeats === undefined || Number(table.seatCount) >= filters.minSeats)
  ));
  return { items, ...summary, matchedTotal: items.length, filters };
}

// ---------------------------------------------------------------------
// HU-102 (Marvin) - Registrar una nueva mesa.
//   CA-1: numero nuevo -> crea la mesa "Disponible" (Resource + mesa 1:1).
//   CA-2: numero repetido -> 409 TABLE_NUMBER_DUPLICATE, no guarda nada.
//   CA-3: falta numero o capacidad -> 422 REQUIRED_FIELDS con un detalle
//         por campo (el frontend los marca en rojo).
//   CA-4: cancelar es solo del frontend.
// ---------------------------------------------------------------------
function normalizeNewTable({ tableNumber, seatCount, location } = {}) {
  const required = [];
  const invalid = [];

  const number = normalizeTableNumber(tableNumber);
  if (isBlank(tableNumber)) {
    required.push({ field: 'tableNumber', message: 'El número de mesa es obligatorio.' });
  } else if (!isValidTableNumber(number)) {
    invalid.push({ field: 'tableNumber', message: TABLE_NUMBER_FORMAT_MESSAGE });
  }

  const seats = toInteger(seatCount);
  if (isBlank(seatCount)) {
    required.push({ field: 'seatCount', message: 'La capacidad (comensales) es obligatoria.' });
  } else if (seats === null || seats < MIN_SEATS || seats > MAX_SEATS) {
    invalid.push({ field: 'seatCount', message: SEAT_COUNT_MESSAGE });
  }

  let place = null;
  if (location !== undefined && location !== null) {
    const text = typeof location === 'string' ? location.trim().replace(/\s+/g, ' ') : null;
    if (text === null || text.length > TABLE_LOCATION_MAX_LENGTH) {
      invalid.push({ field: 'location', message: LOCATION_MESSAGE });
    } else {
      place = text || null;
    }
  }

  // CA-3 manda: si falta algun obligatorio, el mensaje general es el de la
  // historia y los demas errores de formato van en details.
  if (required.length) {
    throw new DomainError(MESSAGES.REQUIRED_FIELDS, 422, {
      code: CODES.REQUIRED_FIELDS, details: [...required, ...invalid],
    });
  }
  if (invalid.length) throw new DomainError(invalid[0].message, 422, { details: invalid });
  return { tableNumber: number, seatCount: seats, location: place };
}

function duplicateTableError(tableNumber, tableId) {
  return new DomainError(MESSAGES.TABLE_NUMBER_DUPLICATE, 409, {
    code: CODES.TABLE_NUMBER_DUPLICATE,
    details: { tableNumber, ...(tableId ? { tableId } : {}) },
  });
}

async function createTable(input = {}) {
  const values = normalizeNewTable(input);
  try {
    return await sequelize.transaction(async (transaction) => {
      const userId = await assertActingUser(input.userId ?? null, { transaction, required: false });

      // CA-2: chequeo previo, para responder sin intentar el INSERT.
      const existing = await RestaurantTable.findOne({ where: { tableNumber: values.tableNumber }, transaction });
      if (existing) throw duplicateTableError(values.tableNumber, existing.tableId);

      const resource = await Resource.create({
        resourceType: 'restaurant_table',
        name: `Mesa ${values.tableNumber}`,
        status: 'available',
      }, { transaction });
      const table = await RestaurantTable.create({
        resourceId: resource.resourceId,
        tableNumber: values.tableNumber,
        seatCount: values.seatCount,
        location: values.location,
        status: 'available',
      }, { transaction });
      await AuditLog.create({
        userId,
        action: 'restaurant_table_created',
        entityType: 'restaurant_table',
        entityId: table.tableId,
        details: JSON.stringify({ ...values, resourceId: resource.resourceId }),
      }, { transaction });
      return mapTable(table);
    });
  } catch (error) {
    // Dos administradores registrando el mismo numero a la vez: el indice
    // UNIQUE(table_number) rechaza al segundo; la transaccion ya se revirtio
    // (no queda un Resource huerfano).
    if (error.name === 'SequelizeUniqueConstraintError') throw duplicateTableError(values.tableNumber);
    throw error;
  }
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

module.exports = {
  listTables, deactivateTable, deleteTable, createTable, normalizeTableFilters,
};
