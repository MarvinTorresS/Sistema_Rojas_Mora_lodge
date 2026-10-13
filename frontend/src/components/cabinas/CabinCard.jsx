import { Check, TriangleAlert } from 'lucide-react';
import useEnterTransition from '../../hooks/useEnterTransition';
import CabinArt from './CabinArt.jsx';
import CapacityMeter from './CapacityMeter.jsx';
import NightStrip from './NightStrip.jsx';
import { CARD_LOOKS } from './cabinLooks';
import { formatColones } from './cabinFormat';

// Insignia de "seleccionada": aparece con un pequeño rebote de escala.
function SelectedBadge() {
  const entered = useEnterTransition();
  return (
    <span
      className={`absolute left-3.5 top-3 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary-700 text-white shadow-card transition-all duration-300 ease-out ${
        entered ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
      }`}
    >
      <Check size={17} strokeWidth={3} />
    </span>
  );
}

const STATUS_ICONS = { check: Check, alert: TriangleAlert };

/**
 * Tarjeta de UNA cabina (concepto A3). Es un componente "tonto": no
 * sabe de la API ni del flujo de la página; recibe la cabina, el look y
 * qué hacer al tocarla. Por eso la página puede renderizar 4 o 40 sin
 * cambiar nada aquí.
 */
function CabinCard({ cabin, lookKey, statusText, partySize, stayDates, onSelect }) {
  const look = CARD_LOOKS[lookKey];
  const StatusIcon = look.icon ? STATUS_ICONS[look.icon] : null;
  const muted = lookKey === 'too_small' || lookKey === 'out_of_service';

  return (
    <button
      type="button"
      onClick={() => onSelect(cabin)}
      disabled={!look.interactive}
      aria-pressed={lookKey === 'selected'}
      title={lookKey === 'too_small' ? `Capacidad máxima: ${cabin.capacity} personas` : undefined}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-card transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${look.frame} ${
        look.dimmed ? 'opacity-[0.72]' : ''
      } ${look.interactive ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg' : 'cursor-not-allowed'}`}
    >
      {/* Ilustración */}
      <div className={`relative flex h-[138px] w-full items-center justify-center transition-colors duration-300 ${look.artBg}`}>
        <CabinArt palette={look.art} width={150} />
        {look.badge && <SelectedBadge />}
      </div>

      {/* Información */}
      <div className="flex w-full flex-1 flex-col gap-[11px] px-4 pb-4 pt-3.5">
        <div className="flex items-baseline gap-1">
          <h3 className="font-display text-[21px] font-bold text-primary-900">{cabin.name}</h3>
          <span className="ml-auto text-[15px] font-bold text-ink">{formatColones(cabin.pricePerNight)}</span>
          <span className="text-[11.5px] text-faint">/ noche</span>
        </div>

        <CapacityMeter capacity={cabin.capacity} partySize={partySize} muted={muted} />
        <NightStrip nights={cabin.nights} stayDates={stayDates} lookKey={lookKey} />

        <span
          className={`mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold transition-colors duration-300 ${look.status}`}
        >
          {StatusIcon && <StatusIcon size={12} strokeWidth={2.6} />}
          {statusText}
        </span>
      </div>
    </button>
  );
}

export default CabinCard;
