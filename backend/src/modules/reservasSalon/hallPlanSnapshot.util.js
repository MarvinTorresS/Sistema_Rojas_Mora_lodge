'use strict';

// HU-011: condiciones contratadas, independientes del catalogo vigente.
function snapshotHallPlan(plan) {
  return {
    planId: plan.planId, planName: plan.planName, hours: Number(plan.hours),
    price: Number(plan.price),
    extraHourPrice: plan.extraHourPrice == null ? null : Number(plan.extraHourPrice),
  };
}

function contractedHallPlan(booking, currentPlan) {
  if (!booking.hallPlanSnapshot) return currentPlan;
  return JSON.parse(booking.hallPlanSnapshot);
}

module.exports = { snapshotHallPlan, contractedHallPlan };
