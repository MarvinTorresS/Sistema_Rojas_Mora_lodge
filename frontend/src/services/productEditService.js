import api from './api';
function friendly(error) {
  const result = new Error(error.response?.data?.error?.message ?? 'No se pudo confirmar la operación. Verificá la conexión y consultá nuevamente el producto.');
  result.details = error.response?.data?.error?.details ?? [];
  return result;
}
export async function getProduct(id) {
  try { return (await api.get(`/restaurant-products/${id}`)).data.data; }
  catch (error) { throw friendly(error); }
}
export async function editProduct(id, changes) {
  try { return (await api.put(`/restaurant-products/${id}`, changes)).data.data; }
  catch (error) { throw friendly(error); }
}
