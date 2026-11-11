'use strict';

// Utilidades PURAS del modulo de restaurante (Sprint 4 - Alison:
// HU-103, HU-106, HU-025, HU-030 y HU-031). No tocan la base de datos ni
// HTTP: las usan los services y se prueban directo con Jest.
//
// Mensajes: estan aqui, en un solo lugar, porque son TEXTO EXACTO que pide
// cada historia de usuario ("Producto sin existencias disponibles", etc.).
// El frontend decide con el `code` del error, nunca comparando el texto.

const MESSAGES = {
  ACCOUNT_VERSION_CONFLICT: 'La cuenta cambió desde que la consultó. Recargue la cuenta antes de volver a editar.',
  ITEM_NOT_FOUND: 'La línea indicada no existe en esta cuenta.',
  ITEM_REMOVED: 'El producto fue retirado de la cuenta y no admite cambios.',
  ITEM_ALREADY_SENT: 'El producto ya fue enviado a cocina y no se puede modificar. Agregue una nueva línea para solicitar más unidades.',
  // HU-106
  TABLE_NOT_FOUND: 'La mesa indicada no existe.',
  TABLE_ALREADY_INACTIVE: 'La mesa ya se encuentra inactiva',
  TABLE_HAS_OPEN_ACCOUNT: 'No es posible desactivar una mesa con cuenta abierta',
  TABLE_DEACTIVATION_NOT_CONFIRMED: 'Debe confirmar la desactivación de la mesa.',
  // HU-025
  ACCOUNT_NOT_FOUND: 'La cuenta indicada no existe.',
  ACCOUNT_CLOSED: 'No es posible modificar una cuenta cerrada',
  ACCOUNT_CANCELLED: 'La cuenta fue anulada y no admite consumos.',
  PRODUCT_NOT_FOUND: 'El producto indicado no existe.',
  PRODUCT_OUT_OF_STOCK: 'Producto sin existencias disponibles',
  PRODUCT_UNAVAILABLE: 'El producto no está disponible en el menú.',
  // HU-030
  GUEST_WITHOUT_ACTIVE_BOOKING: 'El huésped no cuenta con una reserva activa',
  GUEST_AMBIGUOUS: 'Hay más de un huésped con ese dato. Elija la reserva correcta.',
  BOOKING_NOT_FOUND: 'La reserva indicada no existe.',
  // HU-031
  GUEST_WITHOUT_CONSUMPTION: 'Este huésped no tiene consumos registrados en el restaurante',
  // Comun a HU-102 y HU-113 (CA-3): faltan campos obligatorios.
  REQUIRED_FIELDS: 'Los campos marcados con (*) son obligatorios',
  // HU-102 (Marvin)
  TABLE_CREATED: 'Mesa registrada exitosamente',
  TABLE_NUMBER_DUPLICATE: 'Ya existe una mesa registrada con ese número',
  // HU-104 (Marvin): no es un error; el frontend lo muestra con items = [].
  TABLES_NOT_FOUND: 'No se encontraron mesas con los criterios indicados',
  // HU-113 (Marvin)
  PRODUCT_CREATED: 'Producto registrado exitosamente',
  PRODUCT_DUPLICATE: 'Ya existe un producto con ese nombre en esta categoría',
  // HU-024 (Marvin)
  ACCOUNT_OPENED: 'Cuenta abierta exitosamente',
  TABLE_ALREADY_OPENED: 'Esta mesa ya fue abierta',
  TABLE_OCCUPIED: 'La mesa ya se encuentra ocupada',
  TABLE_INACTIVE: 'La mesa seleccionada está inactiva',
  ACTING_USER_REQUIRED: 'No se pudo identificar al usuario que realiza la operación.',
  ACTING_USER_INVALID: 'El usuario indicado no existe o está inactivo.',
};

// Codigos estables que el frontend usa para reaccionar sin leer el texto.
const CODES = {
  ACCOUNT_VERSION_CONFLICT: 'ACCOUNT_VERSION_CONFLICT',
  ITEM_REMOVED: 'ITEM_REMOVED',
  ITEM_ALREADY_SENT: 'ITEM_ALREADY_SENT',
  TABLE_ALREADY_INACTIVE: 'TABLE_ALREADY_INACTIVE',
  TABLE_HAS_OPEN_ACCOUNT: 'TABLE_HAS_OPEN_ACCOUNT',
  ACCOUNT_CLOSED: 'ACCOUNT_CLOSED',
  PRODUCT_OUT_OF_STOCK: 'PRODUCT_OUT_OF_STOCK',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  GUEST_WITHOUT_ACTIVE_BOOKING: 'GUEST_WITHOUT_ACTIVE_BOOKING',
  GUEST_AMBIGUOUS: 'GUEST_AMBIGUOUS',
  TABLE_REQUIRED: 'TABLE_REQUIRED',
  TABLE_OCCUPIED: 'TABLE_OCCUPIED',
  TABLE_INACTIVE: 'TABLE_INACTIVE',
  // HU-102 / HU-113 / HU-024 (Marvin)
  REQUIRED_FIELDS: 'REQUIRED_FIELDS',
  TABLE_NUMBER_DUPLICATE: 'TABLE_NUMBER_DUPLICATE',
  PRODUCT_DUPLICATE: 'PRODUCT_DUPLICATE',
  TABLE_ALREADY_OPENED: 'TABLE_ALREADY_OPENED',
  ACTING_USER_INVALID: 'ACTING_USER_INVALID',
};

// HU-102: limites de una mesa.
const TABLE_NUMBER_MAX_LENGTH = 10;
const TABLE_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;
const MIN_SEATS = 1;
const MAX_SEATS = 20;
const TABLE_LOCATION_MAX_LENGTH = 60;

// HU-113: lista oficial de categorias del menu (unica fuente de verdad: la
// usan el validator, el service y GET /api/restaurant-products/categories).
// Se guarda la etiqueta legible en products.category para que el catalogo
// (HU-114) la muestre tal cual y su busqueda por texto ("bebida") funcione.
const PRODUCT_CATEGORIES = Object.freeze([
  Object.freeze({ value: 'Entrada', label: 'Entrada' }),
  Object.freeze({ value: 'Plato fuerte', label: 'Plato fuerte' }),
  Object.freeze({ value: 'Bebida', label: 'Bebida' }),
  Object.freeze({ value: 'Postre', label: 'Postre' }),
]);
const PRODUCT_NAME_MAX_LENGTH = 100;
const PRODUCT_MAX_PRICE = 99999999.99;
// Limite de la columna INT de stock_quantity.
const PRODUCT_MAX_STOCK = 2147483647;

// Una linea no puede pedirse por una cantidad absurda (error de digitacion).
const MAX_QUANTITY_PER_LINE = 99;
const MAX_ITEMS_PER_REQUEST = 30;

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// HU-102/HU-104: forma canonica del numero de mesa. Recorta espacios y, si
// es solo digitos, quita los ceros a la izquierda ("05" -> "5", "000" ->
// "0") para que "5" y "05" no sean dos mesas distintas. Las letras se pasan
// a mayusculas ("a1" -> "A1"). Devuelve null si no es texto/numero o queda
// vacio; NO valida el formato (eso lo hace isValidTableNumber).
function normalizeTableNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return text.replace(/^0+(?=\d)/, '');
  return text.toUpperCase();
}

function isValidTableNumber(normalized) {
  return typeof normalized === 'string'
    && normalized.length >= 1
    && normalized.length <= TABLE_NUMBER_MAX_LENGTH
    && TABLE_NUMBER_PATTERN.test(normalized);
}

// HU-113: recorta y colapsa espacios internos ("  Café   negro " -> "Café negro").
function normalizeProductName(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text || null;
}

// Clave para comparar nombres sin distinguir mayusculas ni tildes, igual que
// la collation utf8mb4_0900_ai_ci de la BD ("Café" == "cafe").
function productNameKey(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Devuelve el `value` oficial de la categoria (acepta "bebida" o "BEBIDA")
// o null si no es una categoria del menu.
function resolveProductCategory(value) {
  if (typeof value !== 'string') return null;
  const key = productNameKey(value.trim().replace(/\s+/g, ' '));
  const found = PRODUCT_CATEGORIES.find((category) => productNameKey(category.value) === key);
  return found ? found.value : null;
}

// HU-113: precio como numero o texto numerico, > 0, <= 99 999 999.99 y con
// maximo 2 decimales (DECIMAL(10,2)).
function isValidPrice(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const text = String(value).trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return false;
  const amount = Number(text);
  return amount > 0 && amount <= PRODUCT_MAX_PRICE;
}

// HU-113: existencias como entero >= 0 (numero o texto de solo digitos).
// Devuelve el entero o null si no es valido.
function parseStock(value) {
  const number = typeof value === 'string' && /^\s*\d{1,10}\s*$/.test(value) ? Number(value) : value;
  return Number.isInteger(number) && number >= 0 && number <= PRODUCT_MAX_STOCK ? number : null;
}

// "Ordenado por numero ascendente": table_number es VARCHAR(10), asi que un
// orden alfabetico pondria "10" antes de "2". Si ambos son numeros se
// comparan como numeros; si no, como texto "natural" ("A2" < "A10").
function compareTableNumbers(a, b) {
  const left = String(a);
  const right = String(b);
  const bothNumeric = /^\d+$/.test(left) && /^\d+$/.test(right);
  if (bothNumeric) return Number(left) - Number(right);
  return left.localeCompare(right, 'es', { numeric: true, sensitivity: 'base' });
}

// Estado que muestra el listado de mesas: Activa / Inactiva. La ocupacion
// operativa ("ocupada") se informa aparte, porque HU-103 solo pide el
// estado Activa/Inactiva.
function tableStateLabel(status) {
  return status === 'inactive' ? 'Inactiva' : 'Activa';
}

// `location` (ubicacion) llega con HU-102 (registrar mesa); las mesas sin
// ubicacion devuelven null y la pantalla muestra "—".
function mapTable(table) {
  const row = typeof table.get === 'function' ? table.get({ plain: true }) : table;
  return {
    tableId: row.tableId,
    tableNumber: row.tableNumber,
    seatCount: row.seatCount,
    location: row.location ?? null,
    status: row.status,
    isActive: row.status !== 'inactive',
    stateLabel: tableStateLabel(row.status),
    isOccupied: row.status === 'occupied',
  };
}

// Suma de las lineas VIGENTES (las retiradas no cuentan).
function lineSubtotal(item) {
  return round2(Number(item.quantity) * Number(item.unitPrice));
}

function mapAccountItem(item) {
  const row = typeof item.get === 'function' ? item.get({ plain: true }) : item;
  return {
    itemId: row.itemId,
    productId: row.productId,
    name: row.product?.name ?? null,
    category: row.product?.category ?? null,
    quantity: row.quantity,
    unitPrice: round2(row.unitPrice),
    subtotal: lineSubtotal(row),
    kitchenStatus: row.kitchenStatus,
    createdAt: row.createdAt ?? null,
  };
}

function sumItems(items) {
  return round2(items.reduce((total, item) => total + lineSubtotal(item), 0));
}

// Producto del catalogo para tomar pedidos. "Agotado" = sin existencias.
function mapMenuProduct(product) {
  const row = typeof product.get === 'function' ? product.get({ plain: true }) : product;
  const stock = Number(row.stockQuantity) || 0;
  return {
    productId: row.productId,
    name: row.name,
    category: row.category ?? null,
    price: round2(row.price),
    stockQuantity: stock,
    soldOut: stock <= 0,
    status: stock <= 0 ? 'Agotado' : 'Disponible',
  };
}

// HU-113: producto recien registrado con la MISMA forma que devuelve el
// catalogo de HU-114 (listProducts), para que el frontend lo agregue a la
// tabla sin volver a consultar. (Propuesta para el equipo: que listProducts
// use tambien esta funcion; no se cambio para no tocar HU-114.)
function mapCatalogProduct(product) {
  const row = typeof product.get === 'function' ? product.get({ plain: true }) : product;
  const item = mapMenuProduct(row);
  return {
    ...item,
    isAvailable: row.isAvailable,
    status: item.soldOut ? 'Agotado' : row.isAvailable ? 'Disponible' : 'No disponible',
  };
}

// Escapa los comodines de LIKE: lo que digita el usuario se busca literal.
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, '\\$&');
}

// "Cabina 3", "cabina3", "3" -> "3". null si no trae un numero.
function cabinNumberFrom(text) {
  const match = String(text).match(/(\d+)\s*$/) ?? String(text).match(/(\d+)/);
  return match ? String(Number(match[1])) : null;
}

// Una cabina coincide con el texto buscado si el texto es solo su numero
// ("3", "cabina 3") o si el texto esta contenido en su nombre.
function cabinMatches(cabinName, text) {
  const wanted = String(text).trim().toLowerCase();
  if (!wanted) return false;
  const name = String(cabinName).toLowerCase();
  // Un numero ("3" o "cabina 3") identifica una cabina exacta: "3" no debe
  // traer la cabina 13.
  if (/^(cabina\s*)?\d+$/.test(wanted)) {
    const wantedNumber = cabinNumberFrom(wanted);
    return wantedNumber !== null && cabinNumberFrom(name) === wantedNumber;
  }
  return name.includes(wanted);
}

module.exports = {
  MESSAGES,
  CODES,
  MAX_QUANTITY_PER_LINE,
  MAX_ITEMS_PER_REQUEST,
  TABLE_NUMBER_MAX_LENGTH,
  MIN_SEATS,
  MAX_SEATS,
  TABLE_LOCATION_MAX_LENGTH,
  PRODUCT_CATEGORIES,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_MAX_PRICE,
  PRODUCT_MAX_STOCK,
  normalizeTableNumber,
  isValidTableNumber,
  normalizeProductName,
  productNameKey,
  resolveProductCategory,
  isValidPrice,
  parseStock,
  round2,
  compareTableNumbers,
  tableStateLabel,
  mapTable,
  lineSubtotal,
  mapAccountItem,
  sumItems,
  mapMenuProduct,
  mapCatalogProduct,
  escapeLike,
  cabinNumberFrom,
  cabinMatches,
};
