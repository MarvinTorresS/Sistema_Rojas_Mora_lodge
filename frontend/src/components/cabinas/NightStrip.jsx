import { dayOfMonth, formatDayRange, weekdayShort } from './cabinFormat';

// Color de una noche. Las reglas van de la más específica a la general.
function nightTone({ occupied, picked }, lookKey) {
  if (lookKey === 'reserved' && picked) return 'bg-primary-900 text-white';
  if (picked && occupied) return 'bg-coral-400 text-white'; // choque con la estadía
  if (occupied) return 'bg-coral-50 text-coral-600';
  if (lookKey === 'too_small' || lookKey === 'out_of_service') {
    return picked ? 'border border-dashed border-faint bg-surface-alt/60 text-faint' : 'bg-surface-alt/60 text-faint';
  }
  if (picked) return 'bg-primary-700 text-white';
  return 'bg-primary-50/70 text-primary-700';
}

/**
 * "¿Cuándo está libre?" de un vistazo: una celda por noche de la agenda
 * (la manda el backend), resaltando las noches de la estadía elegida.
 */
function NightStrip({ nights, stayDates, lookKey }) {
  if (!nights?.length) return null;
  const picked = new Set(stayDates);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
        Noches · {formatDayRange(nights[0].date, nights[nights.length - 1].date)}
      </span>
      <div className="flex gap-1">
        {nights.map((night) => (
          <span
            key={night.date}
            title={night.occupied ? 'Noche ocupada' : 'Noche libre'}
            className={`flex min-w-0 flex-1 flex-col items-center rounded-lg py-[5px] leading-tight transition-colors duration-300 ${nightTone({ ...night, picked: picked.has(night.date) }, lookKey)}`}
          >
            <span className="text-[9.5px]">{weekdayShort(night.date)}</span>
            <span className="text-[13px] font-bold">{dayOfMonth(night.date)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default NightStrip;
