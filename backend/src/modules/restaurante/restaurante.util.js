'use strict';

// Utilidades PURAS del modulo de restaurante (Sprint 4 - Alison:
// HU-103, HU-106, HU-025, HU-030 y HU-031). No tocan la base de datos ni
// HTTP: las usan los services y se prueban directo con Jest.
//
// Mensajes: estan aqui, en un solo lugar, porque son TEXTO EXACTO que pide
// cada historia de usuario ("Producto sin existencias disponibles", etc.).
// El frontend decide con el `code` del error, nunca comparando el texto.

const MESSAGES = {
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
};

// Codigos estables que el frontend usa para reaccionar sin leer el texto.
const CODES = {
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
};

// Una linea no puede pedirse por una cantidad absurda (error de digitacion).
const MAX_QUANTITY_PER_LINE = 99;
const MAX_ITEMS_PER_REQUEST = 30;

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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

// `location` (ubicacion) llega con HU-102 (registrar mesa): hasta que esa
// columna exista en la tabla, el valor es null y la pantalla muestra "—".
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
  round2,
  compareTableNumbers,
  tableStateLabel,
  mapTable,
  lineSubtotal,
  mapAccountItem,
  sumItems,
  mapMenuProduct,
  escapeLike,
  cabinNumberFrom,
  cabinMatches,
};
