/**
 * Constantes de la pantalla de planes de precios del salón (HU-008 y
 * HU-009). Todo texto oficial de los criterios de aceptación y todo límite
 * vive aquí, en un solo lugar.
 */

// Textos tal cual los pide la historia de usuario.
export const MESSAGES = {
  // HU-008 CA-1: el plan queda disponible de inmediato.
  SUCCESS: 'El plan se registró y ya está disponible para nuevas reservas',
  // HU-008 CA-2.
  DUPLICATE: 'Ya existe un plan con ese nombre',
  // HU-009 CA-2.
  NO_PLANS_FOR_HOURS: 'No hay planes disponibles para el horario indicado',
  // No es un CA: el catálogo está vacío del todo.
  NO_PLANS_AT_ALL: 'Todavía no hay planes de precios registrados.',
};

// Códigos de error estables que manda el backend (se decide por el código).
export const ERROR_CODES = {
  DUPLICATE_PLAN_NAME: 'DUPLICATE_PLAN_NAME',
};

// Límites de los campos. ESPEJAN eventHallPlans.util.js del backend; se
// duplican para avisar al instante sin ir a la red. La regla REAL vive en
// el backend: si los valores se desalinean, el backend responde 422 y la
// pantalla muestra su mensaje junto al campo.
export const LIMITS = {
  NAME_MIN: 3,
  NAME_MAX: 50,
  HOURS_MIN: 1,
  HOURS_MAX: 24,
  PRICE_MAX_DIGITS: 8,
  DEPOSIT_MAX: 100,
  SERVICES_MAX_LENGTH: 600,
};

export const INITIAL_FORM = {
  planName: '', hours: '', price: '', includedServices: '', depositPercentage: '', extraHourPrice: '',
};
