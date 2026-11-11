import api from './api';
import { toFriendlyError } from './restauranteService';

export async function listMenuProducts(q = '') {
  try {
    return (await (q ? api.get('/restaurant-products', { params: { q } }) : api.get('/restaurant-products'))).data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudieron cargar los productos del menú.');
  }
}
