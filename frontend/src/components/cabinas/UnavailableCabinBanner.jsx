import { Check, TriangleAlert, X } from 'lucide-react';
import useEnterTransition from '../../hooks/useEnterTransition';
import { formatDayMonth, pluralize } from './cabinFormat';

// Cuántas alternativas extra se muestran como botones secundarios. Con
// muchas cabinas libres no tiene sentido listarlas todas aquí: las demás
// siguen visibles en la grilla.
const MAX_EXTRA_ALTERNATIVES = 2;

function reasonText({ cabinName, reason, freesOn }) {
  if (reason === 'out_of_service') return `${cabinName} está fuera de servicio por el momento.`;
  if (reason === 'taken') return `${cabinName} acaba de ser reservada por otra persona mientras completabas los datos.`;
  return `${cabinName} está ocupada en esas fechas${freesOn ? ` y se libera el ${formatDayMonth(freesOn)}` : ''}.`;
}

/**
 * CA-2 — "La cabina no se encuentra disponible en las fechas
 * seleccionadas". El título es el texto EXACTO de la HU; el resto explica
 * por qué y sugiere la mejor alternativa (la que deja menos lugares
 * vacíos), con un clic para elegirla.
 */
function UnavailableCabinBanner({ notice, partySize, onChoose, onClose }) {
  const entered = useEnterTransition();
  const [best, ...others] = notice.alternatives;

  return (
    <section
      role="alert"
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-coral-400 bg-coral-50 px-4 py-3 transition-all duration-300 ease-out ${
        entered ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <TriangleAlert size={22} className="shrink-0 text-coral-600" />
      <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
        <p className="text-sm font-bold text-coral-600">La cabina no se encuentra disponible en las fechas seleccionadas</p>
        <p className="text-[12.5px] text-ink">
          {reasonText(notice)}{' '}
          {best
            ? `Te sugerimos ${best.name}: le caben ${best.capacity} personas y está libre esas noches.`
            : `No hay otra cabina libre para ${partySize} ${pluralize(partySize, 'persona', 'personas')} en esas fechas; probá con otras fechas.`}
        </p>
      </div>
      {best && (
        <div className="flex flex-wrap items-center gap-2">
          {others.slice(0, MAX_EXTRA_ALTERNATIVES).map((alt) => (
            <button
              key={alt.resourceId} type="button" onClick={() => onChoose(alt.resourceId)}
              className="rounded-[10px] border border-primary-700 bg-white px-3 py-2 text-[13px] font-semibold text-primary-800 transition-colors hover:bg-primary-50"
            >
              {alt.name}
            </button>
          ))}
          <button
            type="button" onClick={() => onChoose(best.resourceId)}
            className="inline-flex items-center gap-2 rounded-[10px] bg-primary-800 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-900"
          >
            <Check size={16} /> Elegir {best.name}
          </button>
        </div>
      )}
      <button
        type="button" onClick={onClose} aria-label="Cerrar aviso"
        className="flex h-8 w-8 items-center justify-center rounded-full text-coral-600 transition-colors hover:bg-white"
      >
        <X size={16} />
      </button>
    </section>
  );
}

export default UnavailableCabinBanner;
