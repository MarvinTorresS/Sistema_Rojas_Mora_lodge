import api from './api';

export async function checkInCabin(bookingId) {
  try {
    const response = await api.post(`/cabin-bookings/${bookingId}/check-in`);
    return response.data.data;
  } catch (error) {
    throw new Error(error.response?.data?.error?.message
      ?? 'No se pudo conectar con el servidor. Intentá de nuevo.');
  }
}
