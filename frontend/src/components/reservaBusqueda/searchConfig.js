/**
 * Constantes de la pantalla "Buscar reserva" (HU-018) y de la modificación
 * (HU-019). Todo texto oficial de los criterios de aceptación y todo límite
 * vive aquí, en un solo lugar.
 */

// Textos tal cual los pide la historia de usuario.
export const MESSAGES = {
  // HU-018 CA-2.
  NO_RESULTS: 'No se encontraron reservas con los criterios indicados',
  // HU-018 CA-1: sin criterio no hay búsqueda.
  EMPTY_SEARCH: 'Ingrese el nombre o la identificación del huésped para buscar.',
  // HU-019 CA-2.
  CABIN_NOT_AVAILABLE: 'La cabina no se encuentra disponible en las fechas seleccionadas',
  // HU-019 CA-3.
  CABIN_CHANGE_BLOCKED: 'No es posible reasignar cabina con huésped hospedado',
  CHECK_IN_DATE_LOCKED: 'No es posible cambiar la fecha de entrada con huésped hospedado',
  // HU-019 CA-1: no está en la HU; texto propio de la pantalla.
  SAVED: 'La reserva se modificó correctamente',
  NOT_MODIFIABLE: 'Solo se pueden modificar reservas activas o con ingreso registrado.',
};

// Códigos de error estables que manda el backend (se decide por el código).
export const ERROR_CODES = {
  CABIN_NOT_AVAILABLE: 'CABIN_NOT_AVAILABLE',
  CABIN_CHANGE_BLOCKED: 'CABIN_CHANGE_BLOCKED',
  CHECK_IN_DATE_LOCKED: 'CHECK_IN_DATE_LOCKED',
  BOOKING_NOT_MODIFIABLE: 'BOOKING_NOT_MODIFIABLE',
  INVALID_DATES: 'INVALID_DATES',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
};

// Campo del formulario al que pertenece cada error de negocio del backend.
export const ERROR_FIELD_BY_CODE = {
  CABIN_CHANGE_BLOCKED: 'resourceId',
  CHECK_IN_DATE_LOCKED: 'checkInDate',
  INVALID_DATES: 'checkOutDate',
  CAPACITY_EXCEEDED: 'companions',
  EMAIL_IN_USE: 'guestEmail',
};

// Estados desde los que SÍ se puede modificar. ESPEJA MODIFIABLE_STATUSES
// del backend (cabinBookingUpdate.util.js); la regla REAL vive allá.
export const MODIFIABLE_STATUSES = ['active', 'checked_in'];

// Límites del formulario (espejan los de HU-016 en el backend).
export const LIMITS = {
  MAX_COMPANIONS: 50,
  NAME_MIN: 3,
  PHONE_MIN: 8,
};

// Cuántas fechas / cabinas alternativas se ofrecen como botones.
export const MAX_SUGGESTIONS = 3;
