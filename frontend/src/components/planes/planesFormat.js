import { pluralize } from '../cabinas/cabinFormat';
import { LIMITS } from './planesConfig';

/**
 * Funciones auxiliares de la pantalla de planes: texto y revisión del
 * formulario. La revisión de aquí SOLO ahorra un viaje a la red; la que
 * decide es el backend.
 */

// 6 -> "6 horas", 1 -> "1 hora"
export function hoursLabel(hours) {
  return `${hours} ${pluralize(hours, 'hora', 'horas')}`;
}

// 40 -> "40 %", 12.5 -> "12,5 %"
export function depositLabel(percentage) {
  return `${String(percentage).replace('.', ',')} %`;
}

// Hay quien escribe "No incluye" o "Ninguno" en el campo de servicios. Eso no
// es un servicio: la tarjeta lo muestra como "no incluye servicios" en vez de
// pintarlo como si fuera uno más (incluye también la errata "No inlcuye").
const NO_SERVICES_PATTERN = /^\s*(no\s+in(?:cl|lc)u\w*|ning\w*|n\/a|sin\s+servicios?)\.?\s*$/i;

/**
 * Separa los servicios reales de las marcas de "no incluye".
 * -> { services: [...reales], declaredNone: true si solo había marcas }
 */
export function readServices(list = []) {
  const services = list.filter((item) => !NO_SERVICES_PATTERN.test(item));
  return { services, declaredNone: services.length === 0 && list.length > 0 };
}

// Deja solo dígitos (y el máximo de largo indicado).
export function digitsOnly(value, maxLength) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

// Deja dígitos y, como máximo, un punto decimal (para el porcentaje).
export function decimalOnly(value) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}

/**
 * Revisa el formulario y devuelve { campo: mensaje } SOLO de los campos con
 * problema (vacío = todo bien). Los textos son los mismos del backend.
 * HU-008 CA-3: nombre, duración y precio son obligatorios y se marcan todos
 * a la vez, no de uno en uno.
 */
export function validatePlanForm(form) {
  const errors = {};
  const name = form.planName.trim().replace(/\s+/g, ' ');
  if (!name) {
    errors.planName = 'El nombre del plan es obligatorio.';
  } else if (name.length < LIMITS.NAME_MIN || name.length > LIMITS.NAME_MAX) {
    errors.planName = `El nombre del plan debe tener entre ${LIMITS.NAME_MIN} y ${LIMITS.NAME_MAX} caracteres.`;
  }

  if (form.hours.trim() === '') {
    errors.hours = 'La duración del plan en horas es obligatoria.';
  } else {
    const hours = Number(form.hours);
    if (!Number.isInteger(hours) || hours < LIMITS.HOURS_MIN || hours > LIMITS.HOURS_MAX) {
      errors.hours = `La duración debe ser un número entero de horas entre ${LIMITS.HOURS_MIN} y ${LIMITS.HOURS_MAX}.`;
    }
  }

  if (form.price.trim() === '') {
    errors.price = 'El precio del plan es obligatorio.';
  } else if (!(Number(form.price) > 0)) {
    errors.price = 'El precio debe ser un monto mayor a cero.';
  }

  // El anticipo es opcional ("si aplica"): solo se revisa si lo escribieron.
  if (form.depositPercentage.trim() !== '') {
    const deposit = Number(form.depositPercentage);
    if (!Number.isFinite(deposit) || deposit < 0 || deposit > LIMITS.DEPOSIT_MAX) {
      errors.depositPercentage = `El porcentaje de anticipo debe estar entre 0 y ${LIMITS.DEPOSIT_MAX}.`;
    }
  }

  // El costo por hora extra es opcional: vacío = el plan no admite horas extra.
  if (form.extraHourPrice.trim() !== '' && !(Number(form.extraHourPrice) > 0)) {
    errors.extraHourPrice = 'El costo por hora extra debe ser un monto mayor a cero.';
  }
  return errors;
}

/**
 * Cuerpo de POST /event-hall-plans a partir del formulario ya revisado.
 * Servicios, anticipo y costo por hora extra se mandan solo si tienen contenido.
 */
export function buildPlanPayload(form) {
  const payload = {
    planName: form.planName.trim().replace(/\s+/g, ' '),
    hours: Number(form.hours),
    price: Number(form.price),
  };
  if (form.includedServices.trim()) payload.includedServices = form.includedServices.trim();
  if (form.depositPercentage.trim()) payload.depositPercentage = Number(form.depositPercentage);
  if (form.extraHourPrice.trim()) payload.extraHourPrice = Number(form.extraHourPrice);
  return payload;
}
