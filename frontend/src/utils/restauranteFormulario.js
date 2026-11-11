// Utilidades PURAS de los formularios del restaurante - Sprint 4 (Marvin):
//   HU-102 Registrar mesa · HU-113 Registrar producto · HU-104 Buscar mesa.
//
// No conocen React ni la red: reciben datos y devuelven datos. Por eso se
// prueban directo y las comparten las dos pantallas de registro.

// Textos EXACTOS de las historias de usuario.
export const REQUIRED_FIELDS_MESSAGE = 'Los campos marcados con (*) son obligatorios';
export const LEAVE_CONFIRM_MESSAGE = '¿Desea salir sin guardar los cambios?';
export const TABLES_NOT_FOUND_MESSAGE = 'No se encontraron mesas con los criterios indicados';

// Mismos limites que valida el backend (restaurante.util.js).
export const MIN_SEATS = 1;
export const MAX_SEATS = 20;
export const SEAT_SHORTCUTS = [2, 4, 6, 8];
export const MIN_SEAT_FILTERS = [2, 4, 6, 8];
export const LOCATION_SUGGESTIONS = ['Interior', 'Terraza', 'Barra'];
export const TABLE_NUMBER_MAX_LENGTH = 10;
export const TABLE_LOCATION_MAX_LENGTH = 60;
export const PRODUCT_NAME_MAX_LENGTH = 100;
export const MAX_STOCK = 9999;

export const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

// CA-3 (HU-102 y HU-113): campos obligatorios vacios -> { campo: mensaje }.
// requiredFields = { tableNumber: 'El número de mesa es obligatorio.', ... }
export function findMissingFields(values, requiredFields) {
  return Object.entries(requiredFields).reduce((missing, [field, message]) => (
    isBlank(values[field]) ? { ...missing, [field]: message } : missing
  ), {});
}

// Errores por campo a partir del Error que arma toFriendlyError:
//   - 422: `details` es una lista [{ field, message }].
//   - 409 de duplicado: `details` es un objeto; el campo sale de fieldByCode
//     (ej. { TABLE_NUMBER_DUPLICATE: 'tableNumber' }).
export function fieldErrorsFromApi(error, fieldByCode = {}) {
  if (Array.isArray(error?.details)) {
    return error.details.reduce((map, { field, message }) => (
      field && !map[field] ? { ...map, [field]: message } : map
    ), {});
  }
  const field = fieldByCode[error?.code];
  return field ? { [field]: error.message } : {};
}

// CA-4: hay datos sin guardar si algun campo difiere de su valor inicial.
// Se compara como texto recortado para que "  " cuente como vacio.
export function isDirty(values, initialValues) {
  return Object.keys(initialValues).some((field) => (
    String(values[field] ?? '').trim() !== String(initialValues[field] ?? '').trim()
  ));
}

// Entero dentro de [min, max]; si no es numero devuelve `fallback`.
export function clampInteger(value, min, max, fallback = min) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

// Misma normalizacion que el backend (HU-102), solo para MOSTRAR la vista
// previa y el eco de la busqueda: "05" -> "5", "t-1" -> "T-1". El backend
// sigue siendo la fuente de verdad.
export function normalizeTableNumber(text) {
  const trimmed = String(text ?? '').trim();
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed.toUpperCase();
}

// HU-113: el precio se escribe como "4 500", "4500,50" o "4500.5".
// Devuelve un numero con maximo 2 decimales, o null si no es un precio.
export function parsePriceInput(text) {
  const compact = String(text ?? '').replace(/[\s₡]/g, '');
  if (!compact) return null;
  // Con una sola coma y sin punto, la coma es el separador decimal.
  const normalized = compact.includes('.') ? compact.replace(/,/g, '') : compact.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const price = Number(normalized);
  return price > 0 ? price : null;
}

// HU-102: reparte las sillas de la vista previa alrededor de la mesa.
// Arriba y abajo llevan la mayoria; los lados reciben 1 silla desde 3
// personas y 2 desde 8 (la mesa se "alarga" en vez de crecer hacia los lados).
export function chairLayout(seatCount) {
  const seats = clampInteger(seatCount, 0, MAX_SEATS, 0);
  let sides = 0;
  if (seats >= 8) sides = 2;
  else if (seats >= 3) sides = 1;
  const rest = seats - sides * 2;
  const top = Math.ceil(rest / 2);
  return { top, bottom: rest - top, left: sides, right: sides };
}

// HU-104: solo los criterios con valor; null si no hay ninguno, para que el
// listado se pida exactamente como en HU-103.
export function buildTableFilters({ number, minSeats } = {}) {
  const filters = {};
  if (!isBlank(number)) filters.number = String(number).trim();
  if (!isBlank(minSeats)) filters.minSeats = Number(minSeats);
  return Object.keys(filters).length ? filters : null;
}

// Texto del eco de la busqueda: "Mesa 5 · 4 o más personas".
export function describeTableFilters(filters) {
  if (!filters) return '';
  const parts = [];
  if (filters.number) parts.push(`Mesa ${normalizeTableNumber(filters.number)}`);
  if (filters.minSeats) parts.push(`${filters.minSeats} o más personas`);
  return parts.join(' · ');
}

// HU-024: estado operativo de cada mesa para el panel de atencion. La fuente
// de verdad es la cuenta abierta (igual que el backend), no table.status.
export function tableServiceState(table, openAccountId) {
  if (!table.isActive) return 'inactive';
  return openAccountId ? 'occupied' : 'available';
}
