import { Minus, Plus } from 'lucide-react';
import { pluralize } from '../cabinas/cabinFormat';
import { nightsLabel } from './extensionFormat';

/**
 * Selector de noches adicionales: botones − / + y atajos (chips).
 *
 * Es un componente CONTROLADO: no guarda el número, lo recibe en `value` y
 * avisa con `onChange`. Así la página sigue siendo la única dueña del
 * estado y puede, por ejemplo, volver a 1 al cambiar de huésped.
 */
function NightsStepper({ value, min = 1, max, options, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      <span id="extra-nights-label" className="text-[13px] font-bold">Noches adicionales</span>

      <div role="group" aria-labelledby="extra-nights-label" className="flex items-center gap-2.5">
        <button
          type="button" aria-label="Quitar una noche" disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-800 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={18} strokeWidth={2.6} />
        </button>
        <div className="min-w-[110px] text-center">
          <div className="font-display text-[34px] font-bold leading-none text-primary-900">+{value}</div>
          <div className="text-xs text-muted">{pluralize(value, 'noche más', 'noches más')}</div>
        </div>
        <button
          type="button" aria-label="Sumar una noche" disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-800 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={18} strokeWidth={2.6} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {options.filter((option) => option <= max).map((option) => {
          const selected = option === value;
          return (
            <button
              key={option} type="button" aria-pressed={selected} onClick={() => onChange(option)}
              className={`min-h-[36px] rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${
                selected ? 'border-primary-800 bg-primary-800 text-white' : 'border-primary-200 bg-white text-primary-800 hover:bg-primary-50'
              }`}
            >
              +{nightsLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default NightsStepper;
