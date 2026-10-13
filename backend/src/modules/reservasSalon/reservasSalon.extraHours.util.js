'use strict';

// Horas extra de una reserva del salon.
//
// Un plan cubre `plan.hours` horas. Si el horario reservado dura mas, las
// horas que sobran son "horas extra" y se cobran a `plan.extraHourPrice` cada
// una. Estas funciones son puras (sin base de datos ni HTTP): las usan la
// creacion y la modificacion de reservas, asi las dos aplican la misma regla.
//
// Regla: las horas extra declaradas deben ser EXACTAMENTE las que el horario
// necesita. Ni menos (se estaria cobrando de menos un tiempo que se usa) ni
// mas (se cobrarian horas que no estan en el horario). Las horas se cuentan
// completas: 2 h 30 min sobre un plan de 2 h son 1 hora extra.
const { DomainError } = require('../../utils/domainError.util');

// Tope razonable: una reserva no pasa de un dia (el plan mas largo es de 24 h).
const MAX_EXTRA_HOURS = 24;

const round2 = (value) => Math.round(value * 100) / 100;

// Cantidad de horas (completas) que dura el horario.
function bookedHours(start, end) {
  return Math.ceil((end.getTime() - start.getTime()) / 3600000);
}

// Horas extra que el horario necesita para quedar cubierto por el plan.
function requiredExtraHours(plan, start, end) {
  return Math.max(0, bookedHours(start, end) - Number(plan.hours));
}

// null/undefined (reservas anteriores, o un cliente de la API que no lo manda)
// cuentan como 0.
function parseExtraHours(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isInteger(value) ? value : Number.NaN;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

function hasExtraHourPrice(plan) {
  return plan.extraHourPrice !== null && plan.extraHourPrice !== undefined && Number(plan.extraHourPrice) > 0;
}

// Costo de las horas extra (0 si no hay).
function extraHoursCost(plan, extraHours) {
  if (!extraHours || !hasExtraHourPrice(plan)) return 0;
  return round2(extraHours * Number(plan.extraHourPrice));
}

// Precio del plan + horas extra.
function totalPrice(plan, extraHours) {
  return round2(Number(plan.price) + extraHoursCost(plan, extraHours));
}

const plural = (count, one, many) => (count === 1 ? one : many);

/**
 * Revisa que las horas extra declaradas cuadren con el horario y el plan.
 * Lanza DomainError 422 con un mensaje que dice QUE hacer. Devuelve el numero
 * de horas extra ya normalizado.
 */
function assertExtraHours({ plan, start, end, extraHours }) {
  const declared = parseExtraHours(extraHours);
  if (!Number.isInteger(declared) || declared < 0 || declared > MAX_EXTRA_HOURS) {
    throw new DomainError(
      `Las horas extra deben ser un número entero entre 0 y ${MAX_EXTRA_HOURS}.`,
      422,
      { details: [{ field: 'extraHours', message: `Las horas extra deben ser un número entero entre 0 y ${MAX_EXTRA_HOURS}.` }] },
    );
  }

  const needed = requiredExtraHours(plan, start, end);
  const hours = bookedHours(start, end);
  const fail = (message) => {
    throw new DomainError(message, 422, { details: [{ field: 'extraHours', message }] });
  };

  if (declared > 0 && !hasExtraHourPrice(plan)) {
    fail(`El plan "${plan.planName}" no admite horas extra. Elegí un plan más largo o acortá el horario.`);
  }
  if (declared < needed) {
    if (!hasExtraHourPrice(plan)) {
      fail(`El horario dura ${hours} ${plural(hours, 'hora', 'horas')} y el plan "${plan.planName}" cubre ${plan.hours}. Este plan no admite horas extra: elegí un plan más largo o acortá el horario.`);
    }
    fail(`El horario dura ${hours} ${plural(hours, 'hora', 'horas')} y el plan "${plan.planName}" cubre ${plan.hours}: agregá ${needed} ${plural(needed, 'hora extra', 'horas extra')}.`);
  }
  if (declared > needed) {
    fail(needed === 0
      ? 'El horario no supera las horas del plan: no hay horas extra que cobrar.'
      : `El horario solo supera el plan por ${needed} ${plural(needed, 'hora', 'horas')}: no se pueden cobrar ${declared} horas extra.`);
  }
  return declared;
}

module.exports = {
  MAX_EXTRA_HOURS,
  bookedHours,
  requiredExtraHours,
  parseExtraHours,
  hasExtraHourPrice,
  extraHoursCost,
  totalPrice,
  assertExtraHours,
};
