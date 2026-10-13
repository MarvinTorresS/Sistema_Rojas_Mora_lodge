'use strict';

const { AuditLog } = require('../../models');
const ACTION = 'hall_booking_plan_contracted';

// HU-011: condiciones contratadas, independientes del catalogo vigente.
function snapshotHallPlan(plan) {
  return {
    planId: plan.planId, planName: plan.planName, hours: Number(plan.hours),
    price: Number(plan.price),
    extraHourPrice: plan.extraHourPrice == null ? null : Number(plan.extraHourPrice),
  };
}

async function recordContractedHallPlan({ bookingId, plan, transaction, userId = null }) {
  await AuditLog.create({
    userId, action: ACTION, entityType: 'booking', entityId: bookingId,
    details: JSON.stringify({ plan: snapshotHallPlan(plan) }),
  }, { transaction });
}

async function contractedHallPlans(bookings, transaction) {
  const result = new Map();
  if (!bookings.length) return result;
  const entries = await AuditLog.findAll({
    where: { entityType: 'booking', entityId: bookings.map((b) => b.bookingId), action: ACTION },
    order: [['auditId', 'DESC']], transaction,
  });
  for (const entry of entries) {
    if (result.has(entry.entityId)) continue;
    const plan = JSON.parse(entry.details).plan;
    if (!plan || !Number.isFinite(plan.price) || !Number.isFinite(plan.hours)) {
      throw new Error('El registro de condiciones contratadas del salon es invalido.');
    }
    result.set(entry.entityId, plan);
  }
  return result;
}

async function contractedHallPlan(booking, currentPlan, transaction) {
  const plans = await contractedHallPlans([booking], transaction);
  return plans.get(booking.bookingId) ?? currentPlan;
}

module.exports = { snapshotHallPlan, contractedHallPlan, contractedHallPlans, recordContractedHallPlan };
