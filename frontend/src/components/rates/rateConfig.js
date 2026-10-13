/**
 * Constantes de la pantalla de tarifas (HU-128). Todo texto oficial de los
 * criterios de aceptación y todo límite vive aquí, en un solo lugar.
 */

// Mensajes tal cual los pide la historia de usuario.
export const MESSAGES = {
  SUCCESS: 'La tarifa de la cabina se actualizó exitosamente', // CA-1
  INVALID_RATE: 'La tarifa debe ser un monto mayor a cero', // CA-2
};

// La pantalla trabaja en colones enteros (sin céntimos). El backend admite
// hasta 2 decimales, pero en la práctica una tarifa de hospedaje se fija en
// colones completos y así no hay confusión entre punto y coma decimal.
// 8 dígitos = hasta ₡99.999.999, que es lo que cabe en la columna de la base.
export const MAX_RATE_DIGITS = 8;
export const MAX_RATE = 99999999;
export const MESSAGE_RATE_TOO_HIGH = 'La tarifa no puede superar los ₡99.999.999';

// Cómo se muestra el estado de la cabina (tabla de configuración, igual
// que BADGE_TONES en la pantalla de extensión). `available` no lleva
// etiqueta: es lo normal y no hace falta destacarlo.
export const STATUS_BADGES = {
  maintenance: { label: 'En mantenimiento', tone: 'bg-amber-50 text-amber-600' },
  inactive: { label: 'Inactiva', tone: 'bg-surface-alt text-muted' },
};
