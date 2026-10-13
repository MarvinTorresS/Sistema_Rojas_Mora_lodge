import api from './api';
export async function getAccountTotal(accountId) {
  try { return (await api.get(`/restaurant-accounts/${accountId}/total`)).data.data; }
  catch (error) {
    throw new Error(error.response?.data?.error?.message
      ?? 'No se pudo consultar el total. Verificá la conexión e intentá de nuevo.');
  }
}
