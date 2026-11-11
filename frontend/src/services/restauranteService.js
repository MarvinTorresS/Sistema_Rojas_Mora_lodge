import api from './api';

/**
 * Capa de servicio del restaurante (Sprint 4, Alison):
 *   HU-103 listar mesas · HU-106 desactivar mesa · HU-025 agregar productos a
 *   una cuenta de mesa · HU-030 consumo a nombre de un huesped de cabina ·
 *   HU-031 saldo acumulado del huesped.
 *
 * Mismo criterio que reservasSalonService.js: los componentes no conocen axios
 * ni la forma del JSON; reciben datos listos o un Error con el mensaje del
 * backend (y `code`/`details`/`status` para reaccionar sin leer el texto).
 */

const TABLES_PATH = '/restaurant-tables';
const ACCOUNTS_PATH = '/restaurant-accounts';

// Hasta que exista el inicio de sesion (HU-048, Sprint 5) el backend toma el
// usuario que registra del cuerpo de la peticion. Configurable con
// VITE_RESTAURANT_USER_ID; por defecto el usuario 1 (administrador sembrado).
export const RESTAURANT_USER_ID = Number(import.meta.env?.VITE_RESTAURANT_USER_ID ?? 1) || 1;

export function toFriendlyError(error, fallbackMessage) {
  const backendError = error.response?.data?.error;
  // `details` es una LISTA de campos en los 422 del validator, pero un OBJETO
  // en algunos 409 (ej. GUEST_AMBIGUOUS trae los candidatos): solo se arma el
  // texto desde la lista.
  const fieldMessages = Array.isArray(backendError?.details)
    ? backendError.details.map((detail) => detail.message).join(' ')
    : '';
  const friendly = new Error(fieldMessages || backendError?.message || fallbackMessage);
  friendly.details = backendError?.details;
  friendly.status = error.response?.status;
  friendly.code = backendError?.code;
  return friendly;
}

async function request(call, fallbackMessage) {
  try {
    return await call();
  } catch (error) {
    throw toFriendlyError(error, fallbackMessage);
  }
}

// HU-103 -- { data: mesas ordenadas por numero, meta: { total, activeTotal, inactiveTotal, totalCapacity } }
export function listRestaurantTables() {
  return request(async () => (await api.get(TABLES_PATH)).data, 'No se pudieron cargar las mesas.');
}

// HU-106 -- el backend exige `confirmed: true` (la confirmacion ya ocurrio en pantalla).
export function deactivateRestaurantTable(tableId) {
  return request(
    async () => (await api.post(`${TABLES_PATH}/${tableId}/deactivate`, { confirmed: true, userId: RESTAURANT_USER_ID })).data.data,
    'No se pudo desactivar la mesa.',
  );
}

// HU-025 -- menu con existencias ({ data: productos, meta }) y cuentas abiertas.
export function listOrderMenu() {
  return request(async () => (await api.get(`${ACCOUNTS_PATH}/menu`)).data, 'No se pudo cargar el menú.');
}

export function listOpenAccounts() {
  return request(async () => (await api.get(ACCOUNTS_PATH)).data, 'No se pudieron cargar las cuentas abiertas.');
}

export function getAccount(accountId) {
  return request(async () => (await api.get(`${ACCOUNTS_PATH}/${accountId}`)).data.data, 'No se pudo cargar la cuenta.');
}

// items: [{ productId, quantity }] -- todo o nada. Devuelve la cuenta actualizada.
export function addProductsToAccount(accountId, items) {
  return request(
    async () => (await api.post(`${ACCOUNTS_PATH}/${accountId}/items`, { items, userId: RESTAURANT_USER_ID })).data.data,
    'No se pudieron agregar los productos.',
  );
}

// HU-026: userId es metadato temporal de auditoría, como en HU-025.
export function updateItemQuantity(accountId, itemId, { quantity, expectedVersion }) {
  return request(
    async () => (await api.patch(`${ACCOUNTS_PATH}/${accountId}/items/${itemId}`, {
      quantity, expectedVersion, userId: RESTAURANT_USER_ID,
    })).data.data,
    'No se pudo modificar la cantidad.',
  );
}

// HU-030 / HU-031
export function searchGuests(q) {
  return request(async () => (await api.get(`${ACCOUNTS_PATH}/guests`, { params: { q } })).data, 'No se pudo buscar al huésped.');
}

export function registerGuestConsumption({ bookingId, tableId, items }) {
  return request(
    async () => (await api.post(`${ACCOUNTS_PATH}/guest-consumption`, {
      bookingId, ...(tableId ? { tableId } : {}), items, userId: RESTAURANT_USER_ID,
    })).data.data,
    'No se pudo registrar el consumo.',
  );
}

export function getGuestBalance(bookingId) {
  return request(
    async () => (await api.get(`${ACCOUNTS_PATH}/guest-balance`, { params: { bookingId } })).data.data,
    'No se pudo consultar el saldo del huésped.',
  );
}
