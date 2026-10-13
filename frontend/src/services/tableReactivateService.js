import api from './api';
export async function reactivateTable(tableId) {
  try { return (await api.post(`/restaurant-tables/${tableId}/reactivate`)).data.data; }
  catch (error) {
    throw new Error(error.response?.data?.error?.message
      ?? 'No se pudo confirmar la reactivación. Consultá el estado de la mesa antes de reintentar.');
  }
}
