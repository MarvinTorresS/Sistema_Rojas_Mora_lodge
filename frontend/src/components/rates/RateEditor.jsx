import { useEffect, useRef } from 'react';
import { ArrowDownRight, ArrowUpRight, TriangleAlert } from 'lucide-react';
import { formatColones } from '../cabinas/cabinFormat';
import { MAX_RATE_DIGITS } from './rateConfig';
import { describeRateChange, parseRateInput } from './rateFormat';

// Texto de la vista previa según el sentido del cambio (tabla de
// configuración en vez de if/else dentro del JSX).
const CHANGE_LOOKS = {
  up: { Icon: ArrowUpRight, verb: 'Sube', tone: 'text-amber-600' },
  down: { Icon: ArrowDownRight, verb: 'Baja', tone: 'text-teal-600' },
};

/**
 * Formulario para escribir la nueva tarifa de UNA cabina (CA-1, CA-2, CA-4).
 *
 * Es de presentación: el texto escrito, el error y el "guardando" viven en la
 * página; aquí solo se pinta y se avisa por eventos (onChange, onSave,
 * onCancel). Se envía con Enter o con el botón; Escape cancela (CA-4).
 */
function RateEditor({
  cabinId, currentRate, draft, error, isSaving, onChange, onSave, onCancel,
}) {
  const inputRef = useRef(null);
  // Los ids usan el id numérico de la cabina: el nombre lleva espacios
  // ("Cabina 2") y un id con espacios no sirve para aria-describedby.
  const inputId = `rate-${cabinId}`;
  const errorId = `rate-error-${cabinId}`;
  const hintId = `rate-hint-${cabinId}`;

  // Al abrir el editor el cursor ya queda en el campo: se puede escribir
  // sin tocar nada más.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Vista previa solo cuando lo escrito ya es una tarifa válida.
  const parsed = parseRateInput(draft);
  const change = parsed.error ? null : describeRateChange(currentRate, parsed.value);
  const isUnchanged = change?.direction === 'same';
  const look = change && CHANGE_LOOKS[change.direction];

  function handleSubmit(event) {
    event.preventDefault();
    if (!isSaving) onSave();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}
      className="flex flex-col gap-3 border-t border-line bg-surface px-4 py-4 sm:px-5"
      noValidate
    >
      <label htmlFor={inputId} className="text-xs font-semibold text-muted">
        Nueva tarifa por noche
      </label>

      <div
        className={`flex min-h-[44px] max-w-xs items-center gap-2 rounded-[10px] border bg-white px-3 focus-within:ring-2 ${
          error
            ? 'border-coral-400 focus-within:ring-coral-400/30'
            : 'border-faint focus-within:border-primary-600 focus-within:ring-primary-200'
        }`}
      >
        <span className="text-sm font-semibold text-muted" aria-hidden="true">₡</span>
        <input
          id={inputId} ref={inputRef}
          type="text" inputMode="numeric" autoComplete="off" maxLength={MAX_RATE_DIGITS}
          value={draft} disabled={isSaving}
          // Solo dígitos: lo demás se descarta al escribir o pegar.
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
          placeholder="Ej. 60000"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hintId}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[13px] font-semibold text-coral-600">
          <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-[13px] text-muted">
          {look ? (
            <span className={`inline-flex items-center gap-1 font-semibold ${look.tone}`}>
              <look.Icon size={15} aria-hidden="true" />
              {look.verb} {formatColones(change.delta)} ({change.percent} %): quedaría en {formatColones(parsed.value)} por noche
            </span>
          ) : (
            'Escribí solo números, sin puntos ni comas.'
          )}
        </p>
      )}

      <p className="text-[12.5px] text-faint">
        Se aplica solo a las reservas y extensiones que se registren desde ahora.
        Las ya registradas conservan su precio.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button" onClick={onCancel} disabled={isSaving}
          className="min-h-[44px] rounded-[10px] border border-line bg-white px-[18px] text-sm font-semibold text-muted transition-colors hover:bg-surface-alt disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit" disabled={isSaving || isUnchanged}
          className="min-h-[44px] rounded-[10px] bg-primary-700 px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Guardando…' : 'Guardar tarifa'}
        </button>
      </div>
    </form>
  );
}

export default RateEditor;
