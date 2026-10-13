import { formatDayRange, formatShortDate } from '../cabinas/cabinFormat';
import { guestInitials } from './extensionFormat';
import { BADGE_TONES, listBadge } from './extensionLooks';

/**
 * Una fila de la lista de huéspedes. Componente "tonto": recibe la reserva
 * y avisa con `onSelect` cuando la tocan; no sabe de la API ni de la
 * ficha que se abre al lado.
 */
function BookingListItem({ booking, isSelected, today, onSelect }) {
  const badge = listBadge(booking, today);
  const finished = !booking.isExtendable;
  const subtitle = finished
    ? `${booking.cabin.name} · ${formatDayRange(booking.stay.checkInDate, booking.stay.checkOutDate)}`
    : `${booking.cabin.name} · sale ${formatShortDate(booking.stay.checkOutDate)}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(booking)}
      aria-pressed={isSelected}
      className={`flex min-h-[56px] w-full items-center gap-2.5 rounded-xl border-[1.5px] p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
        isSelected ? 'border-primary-600 bg-primary-50' : 'border-line bg-white hover:bg-surface'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
          finished ? 'bg-surface-alt text-muted' : 'bg-teal-50 text-teal-600'
        }`}
      >
        {guestInitials(booking.guest.fullName)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-semibold ${finished ? 'text-muted' : 'text-ink'}`}>
          {booking.guest.fullName}
        </span>
        <span className="truncate text-xs text-muted">{subtitle}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-[3px] text-[11px] font-bold ${BADGE_TONES[badge.tone]}`}>
        {badge.label}
      </span>
    </button>
  );
}

export default BookingListItem;
