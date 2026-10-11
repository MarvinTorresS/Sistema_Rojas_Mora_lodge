'use strict';

// Registro y lectura del MONTO de una estadia en cabina (Sprint 3 --
// Marvin). Lo usan HU-016 (al crear la reserva) y HU-127 (al extenderla).
//
// Por que existe: la tabla `bookings` NO guarda ningun monto, y la unica
// tarifa del esquema es `cabin_details.price_per_night`, que el
// Administrador podra cambiar (HU-128). Si el total se recalculara siempre
// con la tarifa ACTUAL, cambiar el precio alteraria reservas ya
// registradas, y eso viola HU-127 CA-3 y HU-128 CA-3 ("los montos ya
// registrados no deben modificarse").
//
// Solucion sin tocar el esquema: cada vez que se fija un monto se guarda
// una "foto" (tarifa, noches, total) en `audit_log.details`. El total
// vigente de una reserva es el de su ULTIMO registro. Esto ademas cumple
// "registrar el usuario, la fecha y la hora de la modificacion" (HU-127).
const { AuditLog } = require('../../models');

// Acciones de auditoria de este modulo, en un solo lugar para que quien
// escribe (HU-016, HU-127) y quien lee (getRecordedStayTotal) usen
// exactamente el mismo texto.
const CABIN_AUDIT_ACTIONS = {
  BOOKING_CREATED: 'cabin_booking_created',
  STAY_EXTENDED: 'cabin_stay_extended',
  // HU-019: modificacion de fechas, cabina o datos del huesped.
  // Su detalle siempre trae `totalAmount`, igual que las otras dos.
  BOOKING_UPDATED: 'cabin_booking_updated',
};

// Accion de auditoria del cambio de TARIFA (HU-128). Va aparte de
// CABIN_AUDIT_ACTIONS a proposito: esas acciones son de RESERVAS y traen un
// `totalAmount`; mezclar esta ahi la haria entrar al calculo de totales.
const CABIN_RATE_AUDIT_ACTION = 'cabin_rate_updated';

// Acciones cuyo detalle trae el campo `totalAmount` (el total de la
// reserva DESPUES de esa accion).
const AMOUNT_ACTIONS = Object.values(CABIN_AUDIT_ACTIONS);

// Escribe una entrada de auditoria de una reserva de cabina. `details` es
// un objeto; se guarda como JSON en la columna TEXT. `userId` queda nulo
// hasta que exista autenticacion (HU-048, Sprint 5).
async function recordCabinAudit({
  action, bookingId, details, userId = null, transaction,
}) {
  return AuditLog.create({
    userId: userId ?? null,
    action,
    entityType: 'booking',
    entityId: bookingId,
    details: JSON.stringify(details),
  }, { transaction });
}

// Registra que el Administrador cambio la tarifa por noche de una cabina
// (HU-128: "registrar el usuario, la fecha y la hora de la modificacion").
// La entidad auditada es la CABINA (resource), no una reserva. La fecha y
// hora las pone la tabla (created_at); `userId` queda nulo hasta que exista
// autenticacion (HU-048, Sprint 5).
async function recordCabinRateChange({
  resourceId, previousRate, newRate, userId = null, transaction,
}) {
  return AuditLog.create({
    userId: userId ?? null,
    action: CABIN_RATE_AUDIT_ACTION,
    entityType: 'resource',
    entityId: resourceId,
    details: JSON.stringify({ previousPricePerNight: previousRate, newPricePerNight: newRate }),
  }, { transaction });
}

// Total ya registrado de una reserva = `totalAmount` de su ultima entrada
// de auditoria con monto. Si no existe (reservas creadas antes de este
// registro, por ejemplo las del seeder), se usa `fallbackTotal`
// (noches x tarifa actual) y se marca `isEstimated: true` para que quien
// llama sepa que ese numero no es una foto real.
async function getRecordedStayTotal({ bookingId, fallbackTotal, transaction }) {
  const lastEntry = await AuditLog.findOne({
    where: { entityType: 'booking', entityId: bookingId, action: AMOUNT_ACTIONS },
    order: [['auditId', 'DESC']],
    transaction,
  });

  if (lastEntry) {
    try {
      const totalAmount = Number(JSON.parse(lastEntry.details).totalAmount);
      if (Number.isFinite(totalAmount)) {
        return { totalAmount, isEstimated: false };
      }
    } catch (error) {
      // JSON danado: se cae al calculo de respaldo en vez de romper la
      // extension por un dato de auditoria ilegible.
    }
  }
  return { totalAmount: fallbackTotal, isEstimated: true };
}

// Igual que getRecordedStayTotal pero para varias reservas en UNA consulta
// (lo usa la busqueda, que lista hasta una pagina entera). `fallbacks` es un
// Map bookingId -> total de respaldo. Devuelve un Map bookingId ->
// { totalAmount, isEstimated }.
async function getRecordedStayTotals({ fallbacks }) {
  const ids = [...fallbacks.keys()];
  const totals = new Map();
  if (ids.length > 0) {
    const entries = await AuditLog.findAll({
      where: { entityType: 'booking', entityId: ids, action: AMOUNT_ACTIONS },
      order: [['auditId', 'DESC']],
    });
    // Van de la mas nueva a la mas vieja: la primera de cada reserva es la vigente.
    entries.forEach((entry) => {
      if (totals.has(entry.entityId)) return;
      try {
        const totalAmount = Number(JSON.parse(entry.details).totalAmount);
        if (Number.isFinite(totalAmount)) totals.set(entry.entityId, { totalAmount, isEstimated: false });
      } catch (error) {
        // JSON danado: queda el calculo de respaldo.
      }
    });
  }
  ids.forEach((id) => {
    if (!totals.has(id)) totals.set(id, { totalAmount: fallbacks.get(id), isEstimated: true });
  });
  return totals;
}

module.exports = {
  getRecordedStayTotals,
  CABIN_AUDIT_ACTIONS,
  CABIN_RATE_AUDIT_ACTION,
  recordCabinAudit,
  recordCabinRateChange,
  getRecordedStayTotal,
};
