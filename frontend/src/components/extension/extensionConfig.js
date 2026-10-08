/**
 * Constantes de la pantalla "Extender hospedaje" (HU-127).
 *
 * Se agrupan en un solo archivo por dos razones: (1) los números "mágicos"
 * quedan con nombre y comentario en vez de regados por el JSX, y (2) los
 * valores que el backend también conoce quedan visibles en un único lugar
 * para actualizarlos juntos si algún día cambian.
 */

// Tope de noches por extensión. ESPEJA `MAX_EXTENSION_NIGHTS` del backend
// (cabinExtension.service.js). Se duplica a propósito para que los botones
// "+" se desactiven en el límite en lugar de dejar al recepcionista chocar
// con un error. La regla REAL vive en el backend: si los valores se
// desalinean, el backend responde 422 y la pantalla muestra su mensaje.
export const MAX_EXTENSION_NIGHTS = 30;

// Atajos de noches adicionales que se ofrecen como chips.
export const QUICK_NIGHT_OPTIONS = [1, 2, 3, 7];

// Horario de la estadía (política de HU-016: cabinStay.util.js del backend).
// La cotización de la extensión no lo devuelve, por eso se declara aquí.
export const CHECK_IN_TIME = '15:00';
export const CHECK_OUT_TIME = '11:00';

// Esperas antes de consultar al backend, para no disparar una petición por
// cada tecla escrita ni por cada clic en "+".
export const SEARCH_DEBOUNCE_MS = 300;
export const QUOTE_DEBOUNCE_MS = 250;

// Códigos de error estables que manda el backend (se decide por el código,
// nunca por el texto del mensaje, que puede cambiar).
export const ERROR_CODES = {
  EXTENSION_NOT_AVAILABLE: 'EXTENSION_NOT_AVAILABLE',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
};

// Textos oficiales de los criterios de aceptación de HU-127.
export const MESSAGES = {
  SUCCESS: 'La extensión de hospedaje se registró exitosamente', // CA-1
  FINISHED: 'No es posible extender una reserva finalizada', // CA-4
};
