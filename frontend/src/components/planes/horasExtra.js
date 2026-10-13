/**
 * Horas extra de una reserva del salón (pantalla de reservas).
 *
 * Un plan cubre `plan.hours` horas. Las horas que el horario reservado se
 * pasa del plan son "horas extra" y se cobran a `plan.extraHourPrice` cada
 * una. ESPEJA reservasSalon.extraHours.util.js del backend: se repite aquí
 * para avisar al instante, pero la regla REAL la decide el backend (si los
 * dos se desalinean, el backend responde 422 con su mensaje).
 *
 * Regla: las horas extra deben ser EXACTAMENTE las que el horario necesita.
 * Las horas se cuentan completas (2 h 30 min sobre un plan de 2 h = 1 extra).
 */

const MINUTES_PER_DAY = 24 * 60;

function toMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

const plural = (count, one, many) => (count === 1 ? one : many);

/** Horas completas entre dos horas "HH:mm" del mismo día (0 si no son válidas o el fin no es posterior). */
export function hoursBetweenTimes(startTime, endTime) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > MINUTES_PER_DAY) return 0;
  return Math.ceil((end - start) / 60);
}

/** Horas completas entre dos fechas (Date o texto); 0 si no son válidas o el fin no es posterior. */
export function hoursBetweenDates(start, end) {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.ceil((to - from) / 3600000);
}

/** ¿El plan define un costo por hora extra? (los planes anteriores no lo tienen) */
export function admitsExtraHours(plan) {
  return Boolean(plan) && plan.extraHourPrice != null && Number(plan.extraHourPrice) > 0;
}

/** Horas extra que el horario necesita para quedar cubierto por el plan (0 si no se conocen las horas del plan). */
export function requiredExtraHours(plan, bookedHours) {
  if (!plan || !Number.isFinite(Number(plan.hours))) return 0;
  return Math.max(0, bookedHours - Number(plan.hours));
}

/** Lo que cuestan `extraHours` horas extra con este plan (0 si no las admite). */
export function extraHoursCost(plan, extraHours) {
  if (!admitsExtraHours(plan) || !(extraHours > 0)) return 0;
  return Math.round(extraHours * Number(plan.extraHourPrice) * 100) / 100;
}

/**
 * Texto que explica qué está mal con las horas extra, o '' si todo cuadra.
 * Mismos mensajes que el backend.
 */
export function extraHoursProblem(plan, bookedHours, extraHours) {
  if (!plan || !Number.isFinite(Number(plan.hours)) || bookedHours <= 0) return '';
  const needed = requiredExtraHours(plan, bookedHours);
  const admits = admitsExtraHours(plan);
  const hoursText = `${bookedHours} ${plural(bookedHours, 'hora', 'horas')}`;

  if (extraHours > 0 && !admits) {
    return `El plan "${plan.planName}" no admite horas extra. Elegí un plan más largo o acortá el horario.`;
  }
  if (extraHours < needed) {
    return admits
      ? `El horario dura ${hoursText} y el plan "${plan.planName}" cubre ${plan.hours}: agregá ${needed} ${plural(needed, 'hora extra', 'horas extra')}.`
      : `El horario dura ${hoursText} y el plan "${plan.planName}" cubre ${plan.hours}. Este plan no admite horas extra: elegí un plan más largo o acortá el horario.`;
  }
  if (extraHours > needed) {
    return needed === 0
      ? 'El horario no supera las horas del plan: no hay horas extra que cobrar.'
      : `El horario solo supera el plan por ${needed} ${plural(needed, 'hora', 'horas')}: no se pueden cobrar ${extraHours} horas extra.`;
  }
  return '';
}
