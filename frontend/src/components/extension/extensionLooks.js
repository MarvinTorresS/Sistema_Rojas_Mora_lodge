import { countNights } from '../cabinas/cabinFormat';

/**
 * Aspecto de las insignias de estado de una reserva.
 *
 * Mismo patrón que cabinLooks.js: una TABLA de configuración en lugar de
 * if/else regados por el JSX. Los componentes piden `BADGE_TONES[tone]` y
 * no deciden colores; un estado nuevo es una entrada más aquí (principio
 * Abierto/Cerrado de SOLID).
 */
export const BADGE_TONES = {
  danger: 'bg-coral-50 text-coral-600',
  success: 'bg-primary-50 text-primary-700',
  neutral: 'bg-surface-alt text-muted',
  info: 'bg-teal-50 text-teal-600',
};

/**
 * Insignia de la LISTA: dice qué tan urgente es la reserva. Lo que más le
 * importa al recepcionista es quién se va pronto, porque ese huésped es el
 * que probablemente pida más noches.
 *
 * @param {object} booking  ítem de GET /extendable
 * @param {string} today    AAAA-MM-DD de hoy en el hotel
 */
export function listBadge(booking, today) {
  if (booking.status === 'completed') return { label: 'Finalizada', tone: 'neutral' };

  if (booking.status === 'checked_in') {
    const nightsLeft = countNights(today, booking.stay.checkOutDate);
    if (nightsLeft <= 0) return { label: 'Sale hoy', tone: 'danger' };
    if (nightsLeft === 1) return { label: 'Sale mañana', tone: 'danger' };
    return { label: 'Hospedado', tone: 'success' };
  }

  // 'active': reservada, todavía sin ingreso registrado.
  const nightsToCheckIn = countNights(today, booking.stay.checkInDate);
  if (nightsToCheckIn > 0) return { label: 'Próxima', tone: 'info' };
  if (nightsToCheckIn === 0) return { label: 'Entra hoy', tone: 'info' };
  return { label: 'Por ingresar', tone: 'info' };
}

/**
 * Etapa de la reserva para la FICHA (sin urgencia, solo el estado).
 */
export function stageBadge(booking) {
  if (booking.status === 'completed') return { label: 'Finalizada', tone: 'neutral' };
  if (booking.status === 'checked_in') return { label: 'Hospedado', tone: 'success' };
  return { label: 'Reservada', tone: 'info' };
}
