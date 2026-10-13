import CabinArt from '../cabinas/CabinArt.jsx';
import { formatColones, formatShortDate } from '../cabinas/cabinFormat';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../extension/extensionConfig';
import { nightsLabel } from '../extension/extensionFormat';
import { BADGE_TONES, statusBadge } from './searchLooks';

function InfoCell({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col bg-white px-4 py-3">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="m-0 truncate text-sm font-semibold text-ink">{children || '—'}</dd>
    </div>
  );
}

/**
 * Cabecera de la ficha: la cabina, el huésped, sus datos de contacto y la
 * estadía (entrada → noches → salida). Misma estructura visual que
 * StayDetails de la pantalla de extensión; aquí además muestra teléfono,
 * correo, total de personas y tarifa total de la estadía.
 */
function BookingSheet({ booking }) {
  const badge = statusBadge(booking.status);
  const muted = !booking.isModifiable;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-[18px] px-[22px] py-[18px] ${muted ? 'bg-surface-alt' : 'bg-primary-200'}`}>
        <span className="flex h-[78px] w-[108px] items-center justify-center rounded-[14px] bg-white">
          <CabinArt palette={muted ? 'muted' : 'available'} width={96} />
        </span>
        <div className="min-w-[200px] flex-1">
          <h3 className="font-display text-[26px] font-bold text-primary-900">{booking.cabin.name}</h3>
          <p className="text-[13px] text-primary-800">
            {booking.partySize} {booking.partySize === 1 ? 'persona' : 'personas'}
            {booking.cabin.capacity ? ` · capacidad ${booking.cabin.capacity}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${BADGE_TONES[badge.tone]}`}>{badge.label}</span>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3">
        <InfoCell label="Huésped">{booking.guest.fullName}</InfoCell>
        <InfoCell label="Cédula">{booking.guest.identificationNumber}</InfoCell>
        <InfoCell label="Reserva">#{booking.bookingId}</InfoCell>
        <InfoCell label="Teléfono">{booking.guest.phone}</InfoCell>
        <InfoCell label="Correo">{booking.guest.email}</InfoCell>
        <InfoCell label="Total de personas">{String(booking.partySize)}</InfoCell>
      </dl>

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-[22px] py-4">
        <div className="flex flex-col">
          <span className="text-[11px] text-muted">Entrada</span>
          <span className="text-[15px] font-bold">{formatShortDate(booking.stay.checkInDate)}, {CHECK_IN_TIME}</span>
        </div>
        <div className="h-1.5 min-w-[40px] flex-1 rounded-[3px] bg-primary-800" aria-hidden="true" />
        <span className="text-xs font-semibold text-primary-800">{nightsLabel(booking.stay.nights)}</span>
        <div className="h-1.5 min-w-[40px] flex-1 rounded-[3px] bg-primary-800" aria-hidden="true" />
        <div className="flex flex-col items-end">
          <span className="text-[11px] text-muted">Salida</span>
          <span className="text-[15px] font-bold">{formatShortDate(booking.stay.checkOutDate)}, {CHECK_OUT_TIME}</span>
        </div>
      </div>

      {booking.totalAmount != null && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-[22px] py-4">
          <div className="flex flex-col">
            <span className="text-[11px] text-muted">Tarifa total a pagar</span>
            {booking.isTotalEstimated && (
              <span className="text-[11px] text-muted">Calculada con la tarifa actual de la cabina</span>
            )}
          </div>
          <span className="font-display text-[22px] font-bold text-primary-900">{formatColones(booking.totalAmount)}</span>
        </div>
      )}
    </>
  );
}

export default BookingSheet;
