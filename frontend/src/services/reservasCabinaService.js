import api from './api';

/**
 * Capa de servicio de las reservas de cabinas (HU-016 -- Marvin,
 * Sprint 3). Mismo criterio que reservasSalonService.js: los
 * componentes .jsx no saben que existe axios ni la forma exacta del
 * JSON del backend.
 */

// Mismo prefijo montado en el backend: app.use('/api/cabin-bookings', ...)
const BASE_PATH = '/cabin-bookings';
// HU-128: la cabina como recurso (tarifa), app.use('/api/cabins', ...).
const CABINS_PATH = '/cabins';

/**
 * Traduce un error de axios a un Error con datos útiles para la UI.
 *
 * OJO con `details`: desde el Sprint 3 el backend lo usa con DOS formas.
 *  - 422 del validator -> arreglo [{ field, message }] (errores por campo).
 *  - 409 de negocio    -> objeto (ej. { alternatives } o { existingGuest }).
 * Por eso se revisa con Array.isArray antes de usarlo; tratar el objeto
 * como arreglo (details.map) rompería con un TypeError.
 */
function toFriendlyError(error, fallbackMessage) {
  const backendError = error.response?.data?.error;
  const details = backendError?.details;
  const isFieldList = Array.isArray(details);

  const friendlyError = new Error(backendError?.message || fallbackMessage);
  friendlyError.status = error.response?.status;
  friendlyError.code = backendError?.code;
  friendlyError.details = isFieldList ? undefined : details;
  friendlyError.fieldErrors = isFieldList
    ? Object.fromEntries(details.map((detail) => [detail.field, detail.message]))
    : {};
  return friendlyError;
}

/**
 * Disponibilidad de TODAS las cabinas para una estadía y un grupo.
 *
 * @param {{ checkInDate: string, checkOutDate: string, partySize: number,
 *           agendaFrom?: string, agendaTo?: string }} params  fechas AAAA-MM-DD
 * @returns {Promise<{ stay: object, partySize: number, stayPolicy: object,
 *           agenda: object, availableCount: number, cabins: object[] }>}
 */
export async function getCabinAvailability(params) {
  try {
    const response = await api.get(`${BASE_PATH}/availability`, { params });
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo consultar la disponibilidad de las cabinas. Intentá de nuevo.');
  }
}

/**
 * HU-016 — Registrar una reserva de cabina con los datos del huésped.
 *
 * @returns {Promise<{ booking: object, cabin: object, guest: object,
 *           stay: object, totalAmount: number }>}
 */
export async function createCabinBooking(payload) {
  try {
    const response = await api.post(BASE_PATH, payload);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo registrar la reserva. Intentá de nuevo.');
  }
}

/**
 * HU-127 — Reservas entre las que elegir la que se va a extender.
 *
 * El backend devuelve primero las extendibles (activas o con ingreso
 * registrado) y luego las finalizadas más recientes; estas últimas vienen
 * con `isExtendable: false` para poder mostrar el mensaje del CA-4.
 *
 * @param {{ search?: string }} [params]  nombre o identificación del huésped
 * @returns {Promise<object[]>}
 */
export async function listExtendableBookings({ search } = {}) {
  try {
    const response = await api.get(`${BASE_PATH}/extendable`, { params: search ? { search } : {} });
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo cargar el listado de reservas. Intentá de nuevo.');
  }
}

/**
 * HU-127 — Cotización previa de la extensión (solo lectura, no cambia
 * nada). Aplica las MISMAS reglas que la confirmación, así que lo que se
 * ve en pantalla antes de confirmar es lo que el sistema valida después.
 * Si la cabina no está libre lanza un error con code EXTENSION_NOT_AVAILABLE.
 *
 * @param {number} bookingId
 * @param {string} newCheckOutDate  AAAA-MM-DD
 * @returns {Promise<{ stay: object, amounts: object, cabin: object, guest: object }>}
 */
export async function getExtensionQuote(bookingId, newCheckOutDate) {
  try {
    const response = await api.get(`${BASE_PATH}/${bookingId}/extension-quote`, { params: { newCheckOutDate } });
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo calcular la extensión. Intentá de nuevo.');
  }
}

/**
 * HU-127 CA-1 — Confirma la extensión: mueve la fecha de salida y deja la
 * constancia (usuario, fecha y hora) en la bitácora.
 *
 * @param {number} bookingId
 * @param {string} newCheckOutDate  AAAA-MM-DD
 * @returns {Promise<{ booking: object, extension: object, stay: object, amounts: object }>}
 */
export async function extendCabinStay(bookingId, newCheckOutDate) {
  try {
    const response = await api.post(`${BASE_PATH}/${bookingId}/extensions`, { newCheckOutDate });
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo registrar la extensión. Intentá de nuevo.');
  }
}

/**
 * HU-128 — Cabinas con su tarifa vigente por noche.
 *
 * @returns {Promise<{ resourceId: number, name: string, status: string,
 *           capacity: number, pricePerNight: number }[]>}
 */
export async function listCabinRates() {
  try {
    const response = await api.get(CABINS_PATH);
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudieron cargar las tarifas de las cabinas. Intentá de nuevo.');
  }
}

/**
 * HU-128 — Cambia la tarifa por noche de una cabina.
 *
 * Si la tarifa es inválida el backend responde 422 y el mensaje llega en
 * `error.message` (y por campo en `error.fieldErrors.pricePerNight`).
 *
 * @returns {Promise<{ changed: boolean, previousPricePerNight: number,
 *           cabin: { resourceId: number, name: string, pricePerNight: number } }>}
 */
export async function updateCabinRate(resourceId, pricePerNight) {
  try {
    const response = await api.patch(`${CABINS_PATH}/${resourceId}/rate`, { pricePerNight });
    return response.data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo actualizar la tarifa. Intentá de nuevo.');
  }
}
