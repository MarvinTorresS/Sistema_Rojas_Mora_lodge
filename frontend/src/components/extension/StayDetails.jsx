import CabinArt from '../cabinas/CabinArt.jsx';
import { formatColones, formatShortDate } from '../cabinas/cabinFormat';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from './extensionConfig';
import { nightsLabel } from './extensionFormat';
import { BADGE_TONES, stageBadge } from './extensionLooks';

function InfoCell({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col bg-white px-4 py-3">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="m-0 truncate text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}

/**
 * Cabecera de la ficha: la cabina, el huésped que la reservó y la estadía
 * actual (entrada → noches → salida). Es lo que le confirma al recepcionista
 * que está extendiendo la reserva correcta.
 */
function StayDetails({ booking }) {
  const stage = stageBadge(booking);
  const finished = !booking.isExtendable;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-[18px] px-[22px] py-[18px] ${finished ? 'bg-surface-alt' : 'bg-primary-200'}`}>
        <span className="flex h-[78px] w-[108px] items-center justify-center rounded-[14px] bg-white">
          <CabinArt palette={finished ? 'muted' : 'available'} width={96} />
        </span>
        <div className="min-w-[200px] flex-1">
          <h3 className="font-display text-[26px] font-bold text-primary-900">{booking.cabin.name}</h3>
          <p className="text-[13px] text-primary-800">
            Tarifa actual {formatColones(booking.nightlyRate)} / noche
          </p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${BADGE_TONES[stage.tone]}`}>{stage.label}</span>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3">
        <InfoCell label="Huésped">{booking.guest.fullName}</InfoCell>
        <InfoCell label="Cédula">{booking.guest.identificationNumber}</InfoCell>
        <InfoCell label="Reserva">#{booking.bookingId}</InfoCell>
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
          <span className="text-[11px] text-muted">Salida actual</span>
          <span className="text-[15px] font-bold">{formatShortDate(booking.stay.checkOutDate)}, {CHECK_OUT_TIME}</span>
        </div>
      </div>
    </>
  );
}

export default StayDetails;
