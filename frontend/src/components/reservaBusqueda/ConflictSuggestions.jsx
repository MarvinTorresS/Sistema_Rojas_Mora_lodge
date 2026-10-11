import { CalendarDays, Check, TriangleAlert, X } from 'lucide-react';
import { formatDayRange } from '../cabinas/cabinFormat';
import useEnterTransition from '../../hooks/useEnterTransition';
import { MAX_SUGGESTIONS } from './searchConfig';
import { alternativeDatesLabel } from './searchFormat';

/**
 * HU-019 CA-2 — "La cabina no se encuentra disponible en las fechas
 * seleccionadas". El título es el texto que manda el backend; debajo se
 * ofrecen, con un clic, cabinas libres esas fechas y fechas libres en la
 * misma cabina. La reserva original NO cambió.
 */
function ConflictSuggestions({ conflict, onChooseCabin, onChooseDates, onClose }) {
  const entered = useEnterTransition();
  const cabins = conflict.alternatives.slice(0, MAX_SUGGESTIONS);
  const dates = conflict.alternativeDates.slice(0, MAX_SUGGESTIONS);
  const hasSuggestions = cabins.length > 0 || dates.length > 0;

  return (
    <section
      role="alert"
      className={`flex flex-col gap-2.5 rounded-xl border border-coral-400 bg-coral-50 px-4 py-3 transition-all duration-300 ease-out ${
        entered ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert size={20} className="mt-0.5 shrink-0 text-coral-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-coral-600">{conflict.message}</p>
          <p className="text-[12.5px] text-ink">
            La reserva original se mantiene sin modificaciones.
            {hasSuggestions ? ' Podés elegir una alternativa:' : ' Probá con otras fechas u otra cabina.'}
          </p>
        </div>
        <button
          type="button" onClick={onClose} aria-label="Cerrar aviso"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-coral-600 transition-colors hover:bg-white"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {cabins.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Cabinas libres esas fechas</span>
          {cabins.map((cabin) => (
            <button
              key={cabin.resourceId} type="button" onClick={() => onChooseCabin(cabin.resourceId)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-primary-700 bg-white px-3 py-2 text-[13px] font-semibold text-primary-800 transition-colors hover:bg-primary-50"
            >
              <Check size={14} aria-hidden="true" /> Elegir {cabin.name}
            </button>
          ))}
        </div>
      )}

      {dates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Fechas libres en esta cabina</span>
          {dates.map((option) => (
            <button
              key={option.checkInDate} type="button"
              aria-label={`Elegir del ${formatDayRange(option.checkInDate, option.checkOutDate, 'al')}`}
              onClick={() => onChooseDates(option)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-primary-700 bg-white px-3 py-2 text-[13px] font-semibold text-primary-800 transition-colors hover:bg-primary-50"
            >
              <CalendarDays size={14} aria-hidden="true" /> {alternativeDatesLabel(option)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default ConflictSuggestions;
