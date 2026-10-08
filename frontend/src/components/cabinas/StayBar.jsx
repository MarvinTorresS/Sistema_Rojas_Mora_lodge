import { useRef } from 'react';
import { ArrowRight, CalendarDays, Check, Minus, Moon, Plus } from 'lucide-react';
import { formatLongDate, pluralize } from './cabinFormat';

/**
 * Bloque de fecha con el aspecto del prototipo ("mié 14 oct 2026") pero
 * con un <input type="date"> real detrás. El input queda invisible y el
 * botón le pide al navegador abrir su calendario (showPicker). Así se ve
 * igual al diseño y se sigue usando el selector nativo, accesible y
 * validado por el navegador, en vez de programar un calendario propio.
 */
function DateBlock({ id, label, value, hint, min, onChange }) {
  const inputRef = useRef(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') { input.showPicker(); return; }
    } catch { /* navegadores viejos: se cae al focus de abajo */ }
    input.focus();
  }

  return (
    <div className="relative">
      <button
        type="button" onClick={openPicker} aria-label={`${label}: ${formatLongDate(value)}. Cambiar fecha`}
        className="flex items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-primary-50/70"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary-50 text-primary-700">
          <CalendarDays size={18} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">{label}</span>
          <span className="text-[15px] font-semibold text-ink">{formatLongDate(value)}</span>
          <span className="text-[11.5px] text-muted">{hint}</span>
        </span>
      </button>
      <input
        ref={inputRef} id={id} type="date" value={value} min={min} tabIndex={-1} aria-hidden="true"
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
      />
    </div>
  );
}

function PartyStepper({ value, min, max, onChange }) {
  const buttonClass = 'flex h-[38px] w-[38px] items-center justify-center text-primary-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">Personas (huésped + acompañantes)</span>
      <div className="flex w-fit items-center overflow-hidden rounded-[10px] border border-faint bg-white">
        <button type="button" aria-label="Quitar una persona" className={`${buttonClass} hover:bg-surface-alt`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} />
        </button>
        <span className="w-11 text-center text-[17px] font-bold" aria-live="polite">{value}</span>
        <button type="button" aria-label="Agregar una persona" className={`${buttonClass} bg-primary-50 hover:bg-primary-200`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Barra superior: entrada, salida, noches, cuántas cabinas sirven y
 * cuántas personas. Cualquier cambio aquí vuelve a consultar la
 * disponibilidad (lo maneja la página).
 */
function StayBar({
  stay, nights, minDate, maxPartySize, policy, availabilityPill,
  onCheckInChange, onCheckOutChange, onPartySizeChange,
}) {
  return (
    <section className="flex flex-wrap items-center gap-x-[18px] gap-y-3 rounded-[14px] border border-line bg-surface px-5 py-3 shadow-card">
      <DateBlock
        id="cabin-check-in" label="Entrada" value={stay.checkInDate} min={minDate}
        hint={`desde las ${policy.checkInTime}`} onChange={onCheckInChange}
      />
      <ArrowRight size={18} className="text-faint" />
      <DateBlock
        id="cabin-check-out" label="Salida" value={stay.checkOutDate} min={minDate}
        hint={`hasta las ${policy.checkOutTime}`} onChange={onCheckOutChange}
      />
      {nights >= 1 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-900 px-3 py-1.5 text-[12.5px] font-semibold text-white">
          <Moon size={12} strokeWidth={2.4} /> {nights} {pluralize(nights, 'noche', 'noches')}
        </span>
      )}
      {availabilityPill && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700">
          <Check size={12} strokeWidth={2.4} /> {availabilityPill}
        </span>
      )}
      <div className="ml-auto">
        <PartyStepper value={stay.partySize} min={1} max={maxPartySize} onChange={onPartySizeChange} />
      </div>
    </section>
  );
}

export default StayBar;
