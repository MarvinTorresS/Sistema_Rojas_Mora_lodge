import { ArrowRight } from 'lucide-react';
import CabinArt from './CabinArt.jsx';
import { formatColones, formatWeekdayRange, pluralize } from './cabinFormat';

/**
 * Barra inferior tipo "checkout" (concepto A3). Queda pegada abajo
 * (sticky) mientras se recorre la grilla, así el total y el botón de
 * continuar siempre están a la vista aunque haya muchas cabinas.
 */
function ReservationBar({ cabin, stay, nights, policy, onContinue }) {
  const active = Boolean(cabin);
  return (
    <section className="sticky bottom-4 z-10 flex flex-wrap items-center gap-4 rounded-[14px] bg-primary-900 px-[18px] py-3.5 shadow-card">
      <span className="flex h-10 w-[46px] items-center justify-center rounded-[10px] bg-primary-800">
        <CabinArt palette="onDark" width={34} />
      </span>
      <div className="flex flex-col gap-0.5">
        {active ? (
          <>
            <span className="text-[14.5px] font-semibold text-white">
              {cabin.name} · {formatWeekdayRange(stay.checkInDate, stay.checkOutDate)}
            </span>
            <span className="text-xs text-primary-200">
              {nights} {pluralize(nights, 'noche', 'noches')} · {stay.partySize} {pluralize(stay.partySize, 'persona', 'personas')} · entrada {policy.checkInTime}, salida {policy.checkOutTime}
            </span>
          </>
        ) : (
          <>
            <span className="text-[14.5px] font-semibold text-white">Ninguna cabina seleccionada</span>
            <span className="text-xs text-primary-200">Tocá una cabina libre para continuar</span>
          </>
        )}
      </div>
      <div className="ml-auto flex flex-col items-end">
        <span className="text-[11px] text-primary-200">Total estimado</span>
        <span className="font-display text-[22px] font-bold text-white">{active ? formatColones(cabin.stayTotal) : '—'}</span>
      </div>
      <button
        type="button" onClick={onContinue} disabled={!active}
        className="inline-flex items-center gap-2 rounded-[10px] bg-primary-400 px-[18px] py-[13px] text-sm font-semibold text-primary-900 transition-all duration-300 hover:bg-primary-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
      >
        Continuar con el huésped <ArrowRight size={16} />
      </button>
    </section>
  );
}

export default ReservationBar;
