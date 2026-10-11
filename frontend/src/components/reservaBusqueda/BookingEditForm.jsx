import { ArrowRight, TriangleAlert } from 'lucide-react';
import { formatColones } from '../cabinas/cabinFormat';
import { typePhone } from '../common/guestData';
import { MESSAGES } from './searchConfig';
import { minCheckOut } from './searchFormat';

const FIELD_BOX = 'flex min-h-[44px] items-center gap-2 rounded-[10px] border bg-white px-3 focus-within:ring-2';
const FIELD_OK = 'border-faint focus-within:border-primary-600 focus-within:ring-primary-200';
const FIELD_BAD = 'border-coral-400 focus-within:ring-coral-400/30';
const INPUT = 'min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed disabled:text-faint';

/**
 * Un campo del formulario: etiqueta, caja, nota y mensaje de error. Un error
 * reemplaza a la nota (mismo criterio que RateEditor) y queda enlazado con
 * aria-describedby para los lectores de pantalla.
 */
function Field({ id, label, error, note, className = '', children, locked = false }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-semibold text-muted">{label}</label>
      <div className={`mt-1 ${FIELD_BOX} ${error ? FIELD_BAD : FIELD_OK} ${locked ? 'bg-surface-alt' : ''}`}>
        {children}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-coral-600">
          <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        note && <p id={`${id}-note`} className="mt-1 text-[12.5px] text-muted">{note}</p>
      )}
    </div>
  );
}

/**
 * Formulario de modificación de una reserva (HU-019). Es de presentación:
 * el borrador, los errores y el "guardando" viven en la página; aquí solo se
 * pinta y se avisa por eventos. Se envía con Enter o con el botón; Escape
 * cancela.
 *
 * Con el ingreso ya registrado (CA-3) la cabina y la fecha de entrada quedan
 * bloqueadas y se explica por qué; la fecha de salida y los datos del
 * huésped siguen editables.
 */
function BookingEditForm({
  booking, draft, errors, cabins, changes, canSave, isSaving, formError, savingNote,
  onChange, onSubmit, onCancel,
}) {
  const checkedIn = booking.status === 'checked_in';
  const describedBy = (id, error, note) => (error ? `${id}-error` : note ? `${id}-note` : undefined);

  function handleSubmit(event) {
    event.preventDefault();
    if (canSave && !isSaving) onSubmit();
  }

  // Cabinas elegibles: las disponibles y siempre la actual (aunque esté en
  // mantenimiento, para que el desplegable no quede sin su valor).
  const options = cabins.filter(
    (cabin) => cabin.status === 'available' || cabin.resourceId === booking.cabin.resourceId,
  );
  const cabinNote = checkedIn ? MESSAGES.CABIN_CHANGE_BLOCKED : undefined;
  const checkInNote = checkedIn ? MESSAGES.CHECK_IN_DATE_LOCKED : undefined;

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}
      aria-label="Modificar reserva"
      className="flex flex-col"
      noValidate
    >
      <div className="grid gap-4 px-[22px] py-5 sm:grid-cols-6">
        <h4 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted sm:col-span-6">Estadía</h4>

        <Field
          id="edit-cabin" label="Cabina" error={errors.resourceId} note={cabinNote} locked={checkedIn}
          className="sm:col-span-6"
        >
          <select
            id="edit-cabin" value={draft.resourceId} disabled={isSaving || checkedIn}
            onChange={(event) => onChange('resourceId', event.target.value)}
            aria-invalid={Boolean(errors.resourceId)}
            aria-describedby={describedBy('edit-cabin', errors.resourceId, cabinNote)}
            className={INPUT}
          >
            {options.map((cabin) => (
              <option key={cabin.resourceId} value={cabin.resourceId}>
                {cabin.name} · {cabin.capacity} pers. · {formatColones(cabin.pricePerNight)}/noche
              </option>
            ))}
            {/* Si el catálogo no cargó, al menos queda la cabina actual. */}
            {options.length === 0 && <option value={booking.cabin.resourceId}>{booking.cabin.name}</option>}
          </select>
        </Field>

        <Field
          id="edit-checkin" label="Fecha de entrada" error={errors.checkInDate} note={checkInNote} locked={checkedIn}
          className="sm:col-span-3"
        >
          <input
            id="edit-checkin" type="date" value={draft.checkInDate} disabled={isSaving || checkedIn}
            onChange={(event) => onChange('checkInDate', event.target.value)}
            aria-invalid={Boolean(errors.checkInDate)}
            aria-describedby={describedBy('edit-checkin', errors.checkInDate, checkInNote)}
            className={INPUT}
          />
        </Field>

        <Field id="edit-checkout" label="Fecha de salida" error={errors.checkOutDate} className="sm:col-span-3">
          <input
            id="edit-checkout" type="date" value={draft.checkOutDate} disabled={isSaving}
            min={draft.checkInDate ? minCheckOut(draft.checkInDate) : undefined}
            onChange={(event) => onChange('checkOutDate', event.target.value)}
            aria-invalid={Boolean(errors.checkOutDate)}
            aria-describedby={describedBy('edit-checkout', errors.checkOutDate)}
            className={INPUT}
          />
        </Field>

        <Field id="edit-companions" label="Acompañantes" error={errors.companions} className="sm:col-span-2">
          <input
            id="edit-companions" type="text" inputMode="numeric" autoComplete="off" maxLength={2}
            value={draft.companions} disabled={isSaving}
            onChange={(event) => onChange('companions', event.target.value.replace(/\D/g, '').slice(0, 2))}
            aria-invalid={Boolean(errors.companions)}
            aria-describedby={describedBy('edit-companions', errors.companions)}
            className={INPUT}
          />
        </Field>

        <h4 className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted sm:col-span-6">
          Datos del huésped
        </h4>

        <Field id="edit-name" label="Nombre completo" error={errors.guestName} className="sm:col-span-6">
          <input
            id="edit-name" type="text" autoComplete="off" maxLength={150}
            value={draft.guestName} disabled={isSaving}
            onChange={(event) => onChange('guestName', event.target.value)}
            aria-invalid={Boolean(errors.guestName)}
            aria-describedby={describedBy('edit-name', errors.guestName)}
            className={INPUT}
          />
        </Field>

        <Field id="edit-phone" label="Teléfono" error={errors.guestPhone} className="sm:col-span-3">
          <input
            id="edit-phone" type="tel" inputMode="tel" autoComplete="off" maxLength={20} placeholder="8 dígitos"
            value={draft.guestPhone} disabled={isSaving}
            onChange={(event) => onChange('guestPhone', typePhone(event.target.value))}
            aria-invalid={Boolean(errors.guestPhone)}
            aria-describedby={describedBy('edit-phone', errors.guestPhone)}
            className={INPUT}
          />
        </Field>

        <Field id="edit-email" label="Correo" error={errors.guestEmail} className="sm:col-span-3">
          <input
            id="edit-email" type="email" autoComplete="off" maxLength={150}
            value={draft.guestEmail} disabled={isSaving}
            onChange={(event) => onChange('guestEmail', event.target.value)}
            aria-invalid={Boolean(errors.guestEmail)}
            aria-describedby={describedBy('edit-email', errors.guestEmail)}
            className={INPUT}
          />
        </Field>

        <p className="text-[12.5px] text-faint sm:col-span-6">
          La cédula no se puede cambiar. Los datos del huésped se actualizan en su ficha, así que aplican
          también a sus otras reservas.
        </p>
      </div>

      {/* Resumen de lo que se va a cambiar: el recepcionista confirma sobre esto. */}
      {changes.length > 0 && (
        <div aria-label="Cambios a guardar" className="mx-[22px] mb-4 rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Cambios a guardar</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {changes.map((row) => (
              <li key={row.key} className="flex flex-wrap items-center gap-x-2 text-[13px]">
                <span className="text-muted">{row.label}</span>
                <span className="text-faint line-through">{row.from}</span>
                <ArrowRight size={13} className="text-muted" aria-hidden="true" />
                <span className="font-semibold text-ink">{row.to}</span>
              </li>
            ))}
          </ul>
          {savingNote && <p className="mt-2 text-[12.5px] text-muted">{savingNote}</p>}
        </div>
      )}

      {formError && (
        <p role="alert" className="mx-[22px] mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-coral-600">
          <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2.5 border-t border-line bg-surface px-[22px] py-3.5">
        <button
          type="button" onClick={onCancel} disabled={isSaving}
          className="min-h-[46px] rounded-[10px] border border-line bg-white px-[22px] text-sm font-semibold text-ink transition-colors hover:bg-surface-alt disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit" disabled={!canSave || isSaving}
          className="min-h-[46px] rounded-[10px] bg-primary-800 px-[22px] text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-faint"
        >
          {isSaving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

export default BookingEditForm;
