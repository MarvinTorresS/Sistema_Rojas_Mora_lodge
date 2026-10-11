import api from './api';

/**
 * Capa de servicio de los PLANES DE PRECIOS del salón (HU-008 y HU-009 --
 * Sprint 2). Mismo criterio que reservasSalonService.js: los
 * componentes .jsx no saben que existe axios ni la forma exacta del JSON
 * del backend.
 */

// Mismo prefijo montado en el backend: app.use('/api/event-hall-plans', ...)
const BASE_PATH = '/event-hall-plans';

// Cuando el servidor no responde (apagado, sin conexión a la base de datos o
// sin red) axios no trae `error.response`: se avisa eso en vez de un error
// genérico, para que quien opera sepa que no es un problema de sus datos.
const CONNECTION_ERROR_MESSAGE =
  'No se pudo conectar con el servidor. Verificá que el sistema esté encendido e intentá de nuevo.';

/**
 * Traduce un error de axios a un Error con datos útiles para la UI.
 *
 * `details` llega como arreglo [{ field, message }] en los 422 del validator
 * y en el 409 de nombre duplicado; se convierte en `fieldErrors`
 * ({ campo: mensaje }) para pintar cada mensaje junto a su campo. Se decide
 * por `error.code`, nunca comparando el texto del mensaje.
 */
function toFriendlyError(error, fallbackMessage) {
  const backendError = error.response?.data?.error;
  const details = backendError?.details;
  const friendlyError = new Error(
    backendError?.message || (error.response ? fallbackMessage : CONNECTION_ERROR_MESSAGE),
  );
  friendlyError.status = error.response?.status;
  friendlyError.code = backendError?.code;
  friendlyError.fieldErrors = Array.isArray(details)
    ? Object.fromEntries(details.map((detail) => [detail.field, detail.message]))
    : {};
  return friendlyError;
}

/**
 * HU-009 — Planes de precios del salón, de menor a mayor duración.
 *
 * @param {{ hours?: number, search?: string, resourceId?: number }} [params]
 *        `hours` filtra por duración (CA-2).
 * @returns {Promise<{ data: object[], meta: { total: number,
 *           totalWithoutFilters: number, availableHours: number[] } }>}
 */
export async function listEventHallPlans(params = {}) {
  try {
    const response = await api.get(BASE_PATH, { params });
    return response.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudieron cargar los planes del salón. Intentá de nuevo.');
  }
}

/**
 * HU-008 — Registra un plan nuevo. Queda disponible de inmediato para las
 * reservas del salón (CA-1).
 *
 * Errores: 409 con code DUPLICATE_PLAN_NAME si el nombre ya existe (sin
 * distinguir mayúsculas), 422 con `fieldErrors` si faltan o son inválidos
 * el nombre, la duración o el precio.
 *
 * @param {{ planName: string, hours: number, price: number,
 *           includedServices?: string, depositPercentage?: number,
 *           extraHourPrice?: number }} payload
 * @returns {Promise<object>} el plan creado
 */
export async function createEventHallPlan(payload) {
  try {
    const response = await api.post(BASE_PATH, payload);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo registrar el plan. Intentá de nuevo.');
  }
}
