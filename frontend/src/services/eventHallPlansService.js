import api from './api';

/**
 * Capa de servicio del CRUD de planes de precio del salón de eventos
 * (HU-008 a HU-012). Entidad distinta de las reservas del salón
 * (reservasSalonService.js) — ver la nota en el backend
 * (reservasSalon.routes.js) sobre por qué viven separadas. Mismo
 * criterio que los demás services: el componente .jsx no sabe que
 * existe axios ni la forma exacta del JSON del backend.
 */

// Mismo prefijo montado en el backend: app.use('/api/event-hall-plans', ...)
const BASE_PATH = '/event-hall-plans';

function toFriendlyError(error, fallbackMessage) {
  const backendError = error.response?.data?.error;
  const friendlyError = new Error(
    backendError?.details?.map((detail) => detail.message).join(' ') ||
    backendError?.message || fallbackMessage,
  );
  friendlyError.details = backendError?.details;
  friendlyError.status = error.response?.status;
  return friendlyError;
}

/**
 * HU-010 — Buscar un plan de precios del salón por nombre.
 *
 * @param {string} name nombre o parte del nombre a buscar.
 * @returns {Promise<object[]>} planes que coinciden (arreglo vacío si ninguno, CA-2).
 */
export async function searchEventHallPlans(name) {
  try {
    const response = await api.get(`${BASE_PATH}/search`, { params: { name } });
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo buscar el plan de precios. Intentá de nuevo.');
  }
}

/**
 * HU-011 — Editar los datos de un plan de precios existente.
 *
 * @param {number} planId
 * @param {{ planName: string, hours: number, price: number }} payload
 * @returns {Promise<{ plan: object, futureBookingsCount: number }>}
 *   `futureBookingsCount` > 0 (CA-2) no es un error: solo informa cuántas
 *   reservas ya confirmadas usarán los datos nuevos del plan.
 */
export async function updateEventHallPlan(planId, payload) {
  try {
    const response = await api.put(`${BASE_PATH}/${planId}`, payload);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo editar el plan de precios. Intentá de nuevo.');
  }
}

/**
 * HU-012 — Eliminar de forma permanente un plan de precios.
 *
 * @param {number} planId
 * @returns {Promise<{ planId: number }>}
 * @throws {Error} con status 409 (CA-2) cuando el plan tiene reservas
 *   asociadas — el mensaje ya viene listo para mostrar al Administrador.
 */
export async function deleteEventHallPlan(planId) {
  try {
    const response = await api.delete(`${BASE_PATH}/${planId}`);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo eliminar el plan de precios. Intentá de nuevo.');
  }
}
