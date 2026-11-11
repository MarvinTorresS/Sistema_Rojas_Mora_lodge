import api from './api';
import { toFriendlyError } from './restauranteService';

export async function deleteRestaurantTable(tableId, adminApproval) {
  try {
    return (await api.delete(`/restaurant-tables/${tableId}`, {
      data: { confirmed: true, adminApproval },
    })).data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo eliminar la mesa.');
  }
}
