import api from './api';

export async function checkOutCabin(bookingId) {
  try {
    const response = await api.post(`/cabin-bookings/${bookingId}/check-out`);
    return response.data.data;
  } catch (error) {
    const friendly = new Error(error.response?.data?.error?.message
      ?? 'No se pudo conectar con el servidor. Intentá de nuevo.');
    friendly.code = error.response?.data?.error?.code;
    throw friendly;
  }
}
