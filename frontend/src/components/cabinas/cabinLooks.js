import { formatDayMonth, shortGuestName } from './cabinFormat';

/**
 * "Look" visual de cada tarjeta de cabina según su estado.
 *
 * Patrón: TABLA DE CONFIGURACIÓN en vez de if/else regados por el JSX.
 * La tarjeta no decide colores; solo pide CARD_LOOKS[lookKey]. Agregar un
 * estado nuevo (ej. "en limpieza") es agregar UNA entrada aquí, sin tocar
 * CabinCard.jsx (principio Abierto/Cerrado de SOLID).
 *
 * Los estados base vienen del backend (cabin.availability):
 *   available | occupied | too_small | out_of_service
 * y la pantalla agrega tres derivados de lo que hace el recepcionista:
 *   selected (la eligió) | focused (ocupada que tocó, CA-2) | reserved
 *   (recién confirmada, mientras se ve la confirmación).
 */

// Colores de la ilustración. Van en hex porque el SVG usa atributos
// `fill`, no clases de Tailwind. Son los mismos tonos de la paleta del
// proyecto (tailwind.config.js) más 3 tonos intermedios del prototipo.
export const ART_PALETTES = {
  available: { roof: '#639922', wall: '#FFFFFF', door: '#3B6D11', window: '#C0DD97', ground: '#97C459' },
  selected: { roof: '#27500A', wall: '#FFFFFF', door: '#173404', window: '#97C459', ground: '#639922' },
  occupied: { roof: '#D85A30', wall: '#FFFFFF', door: '#993C1D', window: '#FAECE7', ground: '#E8B9A6' },
  muted: { roof: '#B4B2AA', wall: '#F3F2EE', door: '#8A8880', window: '#E4E3DD', ground: '#D9D7CF' },
  reserved: { roof: '#173404', wall: '#FFFFFF', door: '#173404', window: '#C0DD97', ground: '#639922' },
  onDark: { roof: '#97C459', wall: '#FFFFFF', door: '#27500A', window: '#C0DD97', ground: '#639922' },
};

export const CARD_LOOKS = {
  available: {
    frame: 'border-line', artBg: 'bg-primary-50', art: 'available',
    status: 'bg-primary-50 text-primary-700', icon: 'check', interactive: true,
  },
  selected: {
    frame: 'border-primary-600 ring-2 ring-primary-600', artBg: 'bg-primary-200', art: 'selected',
    status: 'bg-primary-700 text-white', icon: 'check', interactive: true, badge: true,
  },
  occupied: {
    frame: 'border-line', artBg: 'bg-coral-50', art: 'occupied',
    status: 'bg-coral-50 text-coral-600', icon: 'alert', interactive: true,
  },
  focused: {
    frame: 'border-coral-400 ring-2 ring-coral-400/80', artBg: 'bg-coral-50', art: 'occupied',
    status: 'bg-coral-400 text-white', icon: 'alert', interactive: true,
  },
  too_small: {
    frame: 'border-line', artBg: 'bg-surface-alt', art: 'muted',
    status: 'bg-surface-alt text-muted', icon: null, interactive: false, dimmed: true,
  },
  out_of_service: {
    frame: 'border-line', artBg: 'bg-surface-alt', art: 'muted',
    status: 'bg-surface-alt text-muted', icon: 'alert', interactive: true, dimmed: true,
  },
  reserved: {
    frame: 'border-primary-900 ring-1 ring-primary-900', artBg: 'bg-primary-200', art: 'reserved',
    status: 'bg-primary-900 text-white', icon: 'check', interactive: false,
  },
};

// Decide el look de UNA cabina. Orden de prioridad: lo recién reservado
// manda, luego la selección del recepcionista, luego el foco de CA-2, y
// por último el estado que mandó el backend.
export function resolveLook({ cabin, selectedCabinId, focusedCabinId, reservedCabinId }) {
  if (cabin.resourceId === reservedCabinId) return 'reserved';
  if (cabin.resourceId === selectedCabinId) return 'selected';
  if (cabin.resourceId === focusedCabinId) return 'focused';
  return cabin.availability in CARD_LOOKS ? cabin.availability : 'out_of_service';
}

export function statusLabel(lookKey, cabin, reservedGuestName) {
  switch (lookKey) {
    case 'selected': return 'Seleccionada';
    case 'occupied':
    case 'focused': return cabin.freesOn ? `Ocupada · se libera el ${formatDayMonth(cabin.freesOn)}` : 'Ocupada';
    case 'too_small': return 'No cabe el grupo';
    case 'out_of_service': return 'Fuera de servicio';
    case 'reserved': return `Reservada · ${shortGuestName(reservedGuestName)}`;
    default: return 'Libre para tus fechas';
  }
}
