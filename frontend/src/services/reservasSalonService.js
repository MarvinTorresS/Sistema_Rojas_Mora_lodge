import api from './api';

/**
 * Capa de servicio de las reservas del salon de eventos (HU-007,
 * HU-013 -- Marvin, Sprint 2). Mismo criterio que
 * reservasCanchaService.js: el componente .jsx no sabe que existe
 * axios ni la forma exacta del JSON del backend.
 */

// Mismo prefijo montado en el backend: app.use('/api/hall-bookings', ...)
const BASE_PATH = '/hall-bookings';

export async function cancelHallBooking(bookingId, payload = {}) {
  try {
    const response = await api.post(`${BASE_PATH}/${bookingId}/cancel`, payload);
    return response.data.data;
  } catch (error) { throw toFriendlyError(error, 'No se pudo cancelar la reserva.'); }
}

export async function listHallBookings(params = {}) {
  try {
    const response = await api.get(BASE_PATH, { params });
    return response.data;
  } catch (error) { throw toFriendlyError(error, 'No se pudieron cargar las reservas del salón.'); }
}

export async function getHallBooking(bookingId) {
  try {
    const response = await api.get(`${BASE_PATH}/${bookingId}`);
    return response.data.data;
  } catch (error) { throw toFriendlyError(error, 'No se pudo cargar la reserva.'); }
}

export async function updateHallBooking(bookingId, changes) {
  try {
    const response = await api.patch(`${BASE_PATH}/${bookingId}`, changes);
    return response.data.data;
  } catch (error) { throw toFriendlyError(error, 'No se pudo modificar la reserva.'); }
}

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
 * HU-007 — Consultar la disponibilidad del salón para una fecha y
 * horario.
 *
 * @param {{ resourceId: number, startDatetime: string, endDatetime: string }} params
 * @returns {Promise<{ available: boolean, reason: string|null }>}
 */
export async function checkHallAvailability(params) {
  try {
    const response = await api.get(`${BASE_PATH}/availability`, { params });
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo consultar la disponibilidad del salón. Intentá de nuevo.');
  }
}

/**
 * HU-013 — Registrar la reserva del salón con el plan de precios
 * seleccionado.
 *
 * @param {{ resourceId: number, planId: number, customerName: string,
 *           customerPhone: string, startDatetime: string, endDatetime: string }} payload
 * @returns {Promise<{ booking: object, plan: object, depositAmount: number, depositPercentage: number }>}
 */
export async function createHallBooking(payload) {
  try {
    const response = await api.post(BASE_PATH, payload);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo registrar la reserva del salón. Intentá de nuevo.');
  }
}
