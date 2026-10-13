import api from './api';
export async function deleteProduct(productId) {
  try { return (await api.delete(`/restaurant-products/${productId}`, { data: { confirmed: true } })).data.data; }
  catch (error) {
    const result = new Error(error.response?.data?.error?.message
      ?? 'No se pudo confirmar la eliminación. Consultá nuevamente el producto antes de reintentar.');
    result.code = error.response?.data?.error?.code;
    throw result;
  }
}
