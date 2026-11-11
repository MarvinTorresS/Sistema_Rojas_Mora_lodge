import { Minus, Plus } from 'lucide-react';
import { clampInteger } from '../../../utils/restauranteFormulario';

/**
 * Entero con botones - y + (capacidad de la mesa en HU-102, existencias en
 * HU-113). El valor se guarda como TEXTO para permitir el campo vacio
 * (CA-3 necesita poder detectar "falta la capacidad").
 */
export default function NumberStepper({
  value, onChange, min, max, unitLabel, disabled = false, inputProps = {},
}) {
  const current = value === '' ? null : Number(value);
  const step = (delta) => onChange(String(clampInteger((current ?? min - delta) + delta, min, max)));

  return (
    <div className="rst-number-stepper">
      <button type="button" aria-label={`Quitar ${unitLabel}`} disabled={disabled || current === null || current <= min}
        onClick={() => step(-1)}><Minus size={18} aria-hidden="true" /></button>
      <input
        {...inputProps}
        type="number" inputMode="numeric" min={min} max={max} value={value} disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => { if (value !== '') onChange(String(clampInteger(value, min, max))); }}
      />
      <button type="button" aria-label={`Agregar ${unitLabel}`} disabled={disabled || (current !== null && current >= max)}
        onClick={() => step(1)}><Plus size={18} aria-hidden="true" /></button>
    </div>
  );
}
