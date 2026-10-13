import { BADGE_TONES as BASE_TONES } from '../extension/extensionLooks';

/**
 * Aspecto de las insignias de estado de una reserva en la búsqueda.
 *
 * Mismo patrón que extensionLooks.js: una TABLA de configuración en lugar
 * de if/else regados por el JSX. Reutiliza los tonos de la pantalla de
 * extensión y agrega uno ámbar para "Pendiente". A diferencia de la lista
 * de extensión, aquí aparecen reservas de CUALQUIER estado (es un buscador
 * de historial), así que cada estado del backend tiene su insignia.
 */
export const BADGE_TONES = { ...BASE_TONES, warning: 'bg-amber-50 text-amber-600' };

const STATUS_BADGES = {
  pending: { label: 'Pendiente', tone: 'warning' },
  active: { label: 'Reservada', tone: 'info' },
  checked_in: { label: 'Hospedado', tone: 'success' },
  completed: { label: 'Finalizada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
  rejected: { label: 'Rechazada', tone: 'danger' },
};

export function statusBadge(status) {
  return STATUS_BADGES[status] ?? { label: status, tone: 'neutral' };
}
