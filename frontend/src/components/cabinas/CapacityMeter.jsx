import { User, Users } from 'lucide-react';
import { pluralize } from './cabinFormat';

// Con más lugares que esto, una fila de siluetas ya no cabe en la
// tarjeta: se cambia a una versión compacta (escala a cabinas grandes).
const MAX_ICONS = 8;

function fitText(capacity, partySize) {
  const missing = partySize - capacity;
  if (missing > 0) return `Máx. ${capacity} · ${pluralize(missing, 'falta 1 lugar', `faltan ${missing}`)}`;
  const spare = capacity - partySize;
  if (spare === 0) return `Caben ${capacity} · justo para el grupo`;
  return `Caben ${capacity} · ${pluralize(spare, 'sobra 1 lugar', `sobran ${spare}`)}`;
}

/**
 * "¿Cabe el grupo?" de un vistazo: siluetas llenas = personas del grupo,
 * claras = lugares que sobran, coral = personas que NO caben.
 */
function CapacityMeter({ capacity, partySize, muted = false }) {
  const slots = Math.max(capacity, partySize);
  const fits = capacity >= partySize;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
        Capacidad para tu grupo de {partySize}
      </span>
      <div className="flex items-center gap-1">
        {slots <= MAX_ICONS ? (
          Array.from({ length: slots }, (_, i) => {
            let tone = 'text-primary-700';
            if (i >= capacity) tone = 'text-coral-400';
            else if (i >= partySize) tone = 'text-primary-200';
            if (muted && i < capacity) tone = 'text-faint';
            return <User key={i} size={18} strokeWidth={2.2} className={`transition-colors duration-300 ${tone}`} />;
          })
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
            <Users size={18} /> {partySize} / {capacity}
          </span>
        )}
        <span className={`ml-auto text-[11.5px] font-semibold ${fits ? 'text-primary-700' : 'text-coral-600'}`}>
          {fitText(capacity, partySize)}
        </span>
      </div>
    </div>
  );
}

export default CapacityMeter;
