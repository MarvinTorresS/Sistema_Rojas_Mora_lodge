import api from './api';
import { RESTAURANT_USER_ID, toFriendlyError } from './restauranteService';

const PRODUCTS_PATH = '/restaurant-products';

export async function listMenuProducts(q = '') {
  try {
    return (await (q ? api.get('/restaurant-products', { params: { q } }) : api.get('/restaurant-products'))).data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudieron cargar los productos del menú.');
  }
}

// HU-113 (Marvin) -- lista oficial de categorias [{ value, label }]. El backend
// es la unica fuente de verdad: si cambia la lista, el formulario la sigue.
export async function listProductCategories() {
  try {
    return (await api.get(`${PRODUCTS_PATH}/categories`)).data.data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudieron cargar las categorías del menú.');
  }
}

// HU-113 (Marvin) -- { data: producto creado, message: "Producto registrado exitosamente" }.
export async function createMenuProduct({ name, category, price, stockQuantity }) {
  try {
    return (await api.post(PRODUCTS_PATH, {
      name, category, price, stockQuantity, userId: RESTAURANT_USER_ID,
    })).data;
  } catch (error) {
    throw toFriendlyError(error, 'No se pudo registrar el producto.');
  }
}
