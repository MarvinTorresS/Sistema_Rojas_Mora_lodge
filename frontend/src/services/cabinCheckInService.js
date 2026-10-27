import api from './api';

export async function getEarlyCheckInQuote(bookingId) {
  try { return (await api.get(`/cabin-bookings/${bookingId}/early-check-in-quote`)).data.data; }
  catch (error) { throw new Error(error.response?.data?.error?.message ?? 'No se pudo consultar el recargo.'); }
}

export async function checkInCabin(bookingId, adminApproval) {
  try {
    const response = await api.post(`/cabin-bookings/${bookingId}/check-in`, adminApproval ? { adminApproval } : undefined);
    return response.data.data;
  } catch (error) {
    throw new Error(error.response?.data?.error?.message
      ?? 'No se pudo conectar con el servidor. Intentá de nuevo.');
  }
}
