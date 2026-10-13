import { Check, Plus } from 'lucide-react';
import useEnterTransition from '../../hooks/useEnterTransition';
import { formatColones, formatShortDate } from './cabinFormat';

function Row({ label, value }) {
  return (
    <div className="flex text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="ml-auto font-semibold text-ink">{value}</span>
    </div>
  );
}

/**
 * Confirmación de CA-1 (reserva registrada). Usa la MISMA animación de
 * entrada que el recibo del salón (escala + desvanecido). Todos los datos
 * salen de la respuesta del backend, no de lo que se había mostrado antes:
 * así lo que ve el recepcionista es lo que realmente quedó guardado.
 */
function BookingConfirmationModal({ confirmation, policy, onReset }) {
  const entered = useEnterTransition();
  const { booking, cabin, guest, stay, totalAmount } = confirmation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="booking-confirmed-title">
      <div className={`absolute inset-0 bg-primary-900/40 transition-opacity duration-300 ${entered ? 'opacity-100' : 'opacity-0'}`} />
      <div
        className={`relative flex w-[460px] max-w-full flex-col items-center gap-3 rounded-[20px] bg-white px-[30px] py-7 text-center shadow-2xl transition-all duration-300 ease-out ${
          entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-primary-600 text-white">
          <Check size={34} strokeWidth={3} />
        </span>
        <h2 id="booking-confirmed-title" className="font-display text-[26px] font-bold text-primary-900">Reserva registrada</h2>
        <p className="text-[13.5px] text-muted">{cabin.name} quedó reservada para {guest.fullName}.</p>

        <div className="flex w-full flex-col gap-[7px] rounded-xl bg-primary-50 p-3.5 text-left">
          <Row label="Reserva" value={`#${booking.bookingId} · activa`} />
          <Row label="Entrada" value={`${formatShortDate(stay.checkInDate)} · ${policy.checkInTime}`} />
          <Row label="Salida" value={`${formatShortDate(stay.checkOutDate)} · ${policy.checkOutTime}`} />
          <div className="my-0.5 h-px bg-primary-200" />
          <div className="flex items-baseline">
            <span className="text-[13.5px] font-bold text-primary-900">Total estimado</span>
            <span className="ml-auto font-display text-[19px] font-bold text-primary-900">{formatColones(totalAmount)}</span>
          </div>
        </div>

        <button
          type="button" onClick={onReset} autoFocus
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary-800 px-[18px] py-[13px] text-sm font-semibold text-white transition-colors hover:bg-primary-900"
        >
          <Plus size={16} /> Registrar otra reserva
        </button>
      </div>
    </div>
  );
}

export default BookingConfirmationModal;
