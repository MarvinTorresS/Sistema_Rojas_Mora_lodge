import { useEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import { LIMITS } from './planesConfig';
import { decimalOnly, digitsOnly } from './planesFormat';

const FIELD_BOX = 'flex min-h-[44px] items-center gap-2 rounded-[10px] border bg-white px-3 focus-within:ring-2';
const FIELD_OK = 'border-faint focus-within:border-primary-600 focus-within:ring-primary-200';
const FIELD_BAD = 'border-coral-400 focus-within:ring-coral-400/30';
const INPUT = 'min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint';

/**
 * Un campo del formulario: etiqueta, caja, pista y mensaje de error. El
 * error reemplaza a la pista (mismo criterio que RateEditor) y queda
 * enlazado con aria-describedby para los lectores de pantalla.
 */
function Field({ id, label, required = false, error, hint, prefix, suffix, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}{required && <span aria-hidden="true"> *</span>}
      </label>
      <div className={`mt-1 ${FIELD_BOX} ${error ? FIELD_BAD : FIELD_OK}`}>
        {prefix && <span className="text-sm font-semibold text-muted" aria-hidden="true">{prefix}</span>}
        {children}
        {suffix && <span className="text-sm font-semibold text-muted" aria-hidden="true">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-coral-600">
          <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && <p id={`${id}-hint`} className="mt-1 text-[12.5px] text-muted">{hint}</p>
      )}
    </div>
  );
}

/**
 * Formulario "Nuevo plan" (HU-008). Es de presentación: los valores, los
 * errores y el "guardando" viven en la página; aquí solo se pinta y se avisa
 * por eventos (onChange, onSubmit, onCancel). Se envía con Enter o con el
 * botón; Escape cancela.
 */
function PlanForm({ form, errors, formError, isSaving, onChange, onSubmit, onCancel }) {
  const nameRef = useRef(null);
  // Al abrir el formulario el cursor ya queda en el primer campo.
  useEffect(() => { nameRef.current?.focus(); }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (!isSaving) onSubmit();
  }

  const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}
      aria-label="Nuevo plan de precios"
      className="flex flex-col gap-4 rounded-2xl border border-primary-600 bg-surface px-4 py-4 shadow-card sm:px-5"
      noValidate
    >
      <h3 className="font-display text-base font-semibold text-primary-900">Nuevo plan de precios</h3>

      <div className="grid gap-4 sm:grid-cols-6">
        <Field id="plan-name" label="Nombre del plan" required error={errors.planName} className="sm:col-span-6">
          <input
            id="plan-name" ref={nameRef} type="text" autoComplete="off" maxLength={LIMITS.NAME_MAX}
            value={form.planName} disabled={isSaving}
            onChange={(event) => onChange('planName', event.target.value)}
            placeholder="Ej. Plan Boda"
            aria-invalid={Boolean(errors.planName)}
            aria-describedby={describedBy('plan-name', errors.planName)}
            className={INPUT}
          />
        </Field>

        <Field
          id="plan-hours" label="Duración" required error={errors.hours} suffix="horas"
          hint={`Entre ${LIMITS.HOURS_MIN} y ${LIMITS.HOURS_MAX}.`} className="sm:col-span-3"
        >
          <input
            id="plan-hours" type="text" inputMode="numeric" autoComplete="off" maxLength={2}
            value={form.hours} disabled={isSaving}
            onChange={(event) => onChange('hours', digitsOnly(event.target.value, 2))}
            placeholder="Ej. 8"
            aria-invalid={Boolean(errors.hours)}
            aria-describedby={describedBy('plan-hours', errors.hours, true)}
            className={INPUT}
          />
        </Field>

        <Field
          id="plan-price" label="Precio" required error={errors.price} prefix="₡"
          hint="Solo números, sin puntos ni comas." className="sm:col-span-3"
        >
          <input
            id="plan-price" type="text" inputMode="numeric" autoComplete="off" maxLength={LIMITS.PRICE_MAX_DIGITS}
            value={form.price} disabled={isSaving}
            onChange={(event) => onChange('price', digitsOnly(event.target.value, LIMITS.PRICE_MAX_DIGITS))}
            placeholder="Ej. 180000"
            aria-invalid={Boolean(errors.price)}
            aria-describedby={describedBy('plan-price', errors.price, true)}
            className={INPUT}
          />
        </Field>

        <Field
          id="plan-services" label="Servicios incluidos" error={errors.includedServices}
          hint="Separalos con coma. Ej. Mobiliario, Sonido, Decoración." className="sm:col-span-6"
        >
          <input
            id="plan-services" type="text" autoComplete="off" maxLength={LIMITS.SERVICES_MAX_LENGTH}
            value={form.includedServices} disabled={isSaving}
            onChange={(event) => onChange('includedServices', event.target.value)}
            aria-invalid={Boolean(errors.includedServices)}
            aria-describedby={describedBy('plan-services', errors.includedServices, true)}
            className={INPUT}
          />
        </Field>

        <Field
          id="plan-extra-hour" label="Costo por hora extra" error={errors.extraHourPrice} prefix="₡"
          hint="Lo que se cobra por cada hora que se pase del plan. Vacío: el plan no admite horas extra." className="sm:col-span-3"
        >
          <input
            id="plan-extra-hour" type="text" inputMode="numeric" autoComplete="off" maxLength={LIMITS.PRICE_MAX_DIGITS}
            value={form.extraHourPrice} disabled={isSaving}
            onChange={(event) => onChange('extraHourPrice', digitsOnly(event.target.value, LIMITS.PRICE_MAX_DIGITS))}
            placeholder="Ej. 8000"
            aria-invalid={Boolean(errors.extraHourPrice)}
            aria-describedby={describedBy('plan-extra-hour', errors.extraHourPrice, true)}
            className={INPUT}
          />
        </Field>

        <Field
          id="plan-deposit" label="Anticipo, si aplica" error={errors.depositPercentage} suffix="%"
          hint="Déjalo vacío si el plan no define uno." className="sm:col-span-3"
        >
          <input
            id="plan-deposit" type="text" inputMode="decimal" autoComplete="off" maxLength={6}
            value={form.depositPercentage} disabled={isSaving}
            onChange={(event) => onChange('depositPercentage', decimalOnly(event.target.value))}
            placeholder="Ej. 30"
            aria-invalid={Boolean(errors.depositPercentage)}
            aria-describedby={describedBy('plan-deposit', errors.depositPercentage, true)}
            className={INPUT}
          />
        </Field>
      </div>

      {formError && (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] font-semibold text-coral-600">
          <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button" onClick={onCancel} disabled={isSaving}
          className="min-h-[44px] rounded-[10px] border border-line bg-white px-[18px] text-sm font-semibold text-muted transition-colors hover:bg-surface-alt disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit" disabled={isSaving}
          className="min-h-[44px] rounded-[10px] bg-primary-700 px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Guardando…' : 'Guardar plan'}
        </button>
      </div>
    </form>
  );
}

export default PlanForm;
