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
  // `details` es una LISTA de campos en los 422 del validator, pero un
  // OBJETO en algunos 409 (ej. CUSTOMER_PHONE_CONFLICT trae los clientes
  // existentes). Solo se arma el texto desde la lista; si no, `.map` sobre
  // un objeto lanzaría TypeError y se perdería el error real.
  const fieldMessages = Array.isArray(backendError?.details)
    ? backendError.details.map((detail) => detail.message).join(' ')
    : '';
  const friendlyError = new Error(fieldMessages || backendError?.message || fallbackMessage);
  friendlyError.details = backendError?.details;
  friendlyError.status = error.response?.status;
  friendlyError.code = backendError?.code;
  return friendlyError;
}

/**
 * Horario fijo de entrada y salida del salón (se reserva por día).
 *
 * @returns {Promise<{ checkInTime: string, checkOutTime: string }>} "HH:mm"
 */
export async function getHallSchedule() {
  try {
    const response = await api.get(`${BASE_PATH}/schedule`);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo cargar el horario del salón.');
  }
}

/**
 * HU-007 — Consultar la disponibilidad del salón para un día.
 *
 * @param {{ resourceId: number, date: string }} params  date: yyyy-mm-dd
 * @returns {Promise<{ available: boolean, reason: string|null, checkInTime: string, checkOutTime: string }>}
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
 * HU-013 — Registrar la reserva del salón para un día.
 *
 * @param {{ resourceId: number, customerName: string, customerPhone: string,
 *           date: string }} payload  date: yyyy-mm-dd
 * @returns {Promise<{ booking: object, date: string, checkInTime: string, checkOutTime: string }>}
 */
export async function createHallBooking(payload) {
  try {
    const response = await api.post(BASE_PATH, payload);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo registrar la reserva del salón. Intentá de nuevo.');
  }
}
