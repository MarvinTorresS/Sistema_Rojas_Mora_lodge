import api from './api';

/**
 * Capa de servicio del módulo de reservas de cancha (HU-001 a HU-006),
 * lado frontend. Mismo motivo que en el backend: el componente .jsx no
 * debería saber que existe axios ni la forma exacta de la respuesta del
 * backend — solo le pide a esta función "creá una reserva con estos
 * datos" y recibe de vuelta algo simple: la reserva creada, o un
 * mensaje de error ya listo para mostrar.
 *
 * Así, si mañana cambia el endpoint o la forma del JSON de error,
 * se ajusta en un solo lugar (acá), no en cada componente que lo usa.
 */

// Mismo prefijo que se montó en el backend: app.use('/api/field-bookings', ...)
const BASE_PATH = '/field-bookings';

/** HU-003: cliente parcial, telefono exacto y fecha de inicio, combinados con AND. */
export async function searchFieldBookings(params = {}) {
  try {
    const response = await api.get(`${BASE_PATH}/search`, { params });
    return response.data;
  } catch (error) {
    const backendError = error.response?.data?.error;
    const friendlyError = new Error(
      backendError?.details?.map((detail) => detail.message).join(' ') ||
      backendError?.message || 'No se pudo buscar reservas. Intentá de nuevo.',
    );
    friendlyError.details = backendError?.details;
    friendlyError.status = error.response?.status;
    throw friendlyError;
  }
}

/**
 * HU-001 — Registrar una nueva reserva de cancha sintética.
 *
 * @param {{ resourceId: number, customerName: string, customerPhone: string,
 *           startDatetime: string, endDatetime: string }} payload
 * @returns {Promise<object>} la reserva creada (tal como la devuelve el backend)
 * @throws {Error} con `.message` ya listo para mostrarle al usuario y
 *   `.details` (opcional) con la lista de campos inválidos, cuando el
 *   backend respondió 422 con detalle de validación (CA-3).
 */
export async function createFieldBooking(payload) {
  try {
    const response = await api.post(BASE_PATH, payload);
    return response.data.data;
  } catch (error) {
    // El backend siempre responde errores como { error: { message, details? } }
    // (ver errorHandler.middleware.js y reservasCancha.validator.js).
    // Si por algún motivo no hay respuesta (backend caído, sin red),
    // se arma un mensaje genérico en vez de dejar pasar el error crudo
    // de axios, que no es legible para quien use el formulario.
    const backendError = error.response?.data?.error;
    const friendlyError = new Error(
      backendError?.message ?? 'No se pudo registrar la reserva. Intentá de nuevo.',
    );
    friendlyError.details = backendError?.details;
    friendlyError.status = error.response?.status;
    throw friendlyError;
  }
}

/**
 * HU-002 — Consultar el listado de reservas registradas de la cancha.
 *
 * Todos los filtros son opcionales; si no se pasan, el backend devuelve
 * la primera página con su tamaño por defecto.
 *
 * @param {{ date?: string, status?: string, page?: number, pageSize?: number }} [params]
 *   `date` en formato yyyy-mm-dd.
 * @returns {Promise<{ data: object[], meta: { page:number, pageSize:number, total:number, totalPages:number } }>}
 * @throws {Error} con `.message` listo para mostrar y `.status` (código HTTP).
 */
export async function listFieldBookings(params = {}) {
  try {
    // axios omite del query string los params con valor undefined, así
    // que no hace falta filtrarlos a mano acá.
    const response = await api.get(BASE_PATH, { params });
    return response.data;
  } catch (error) {
    const backendError = error.response?.data?.error;
    const friendlyError = new Error(
      backendError?.message ?? 'No se pudo cargar el listado de reservas. Intentá de nuevo.',
    );
    friendlyError.details = backendError?.details;
    friendlyError.status = error.response?.status;
    throw friendlyError;
  }
}
