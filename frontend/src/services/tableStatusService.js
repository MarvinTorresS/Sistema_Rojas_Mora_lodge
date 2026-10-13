import api from './api';
export async function listTableStatuses() {
  try {
    return (await api.get('/restaurant-tables/status')).data;
  } catch (error) {
    throw new Error(error.response?.data?.error?.message
      ?? 'No se pudo consultar el estado de las mesas. Verificá la conexión e intentá de nuevo.');
  }
}
